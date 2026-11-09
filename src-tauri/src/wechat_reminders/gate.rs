//! WeChat 4.x is a Qt app whose accessibility is gated by one byte in Weixin.dll: 0 (the default)
//! shows UI Automation only the window frame, 1 exposes the controls, chat list included. This
//! finds that byte and sets it in the running WeChat, keeps it set across WeChat restarts while
//! the setting asks for it, and sets it back. Approach and byte pattern from wechatauto-replica's
//! wake_uia.py (Apache-2.0); first written as the plugin `dev.shenglin1001.wechat-preview`.

use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
use windows::Win32::Foundation::HWND;

use crate::win32::{
    process,
    process_memory::{self, ProcessMemory},
    uia_list,
};

const CORE_STRING: &[u8] = b"qt.accessibility.core";
const EXECUTE: u32 = 0x2000_0000;
const WRITE: u32 = 0x8000_0000;
/// Gate checks this far from code that names the accessibility logging category rank first.
const NEAR: u32 = 0x20000;
/// Unverified addresses tried before giving up: only the best-ranked one. Each try writes a byte
/// into WeChat, and a pattern that matched some other flag could upset WeChat while it is set.
const MAX_TRIES: usize = 1;
/// A restarted WeChat starts with the byte back at 0; look for one this often.
const CHECK: Duration = Duration::from_secs(5);

/// The byte the island set to 1, and what it held before.
struct Gate {
    process_id: u32,
    address: usize,
    original: u8,
    /// `gate-on.json`: which byte is still on, so a run that ended before it could put the byte
    /// back is put right by the next one (`adopt`).
    marker: PathBuf,
}

impl Gate {
    fn is_on(&self) -> bool {
        ProcessMemory::open(self.process_id)
            .is_some_and(|memory| memory.read_byte(self.address) == Some(1))
    }

    /// Puts the byte back; nothing to do when it was 1 before (a screen reader, say).
    fn restore(&self) {
        if self.original != 1 {
            if let Some(memory) = ProcessMemory::open(self.process_id) {
                if memory.read_byte(self.address) == Some(1) {
                    memory.write_byte(self.address, self.original);
                }
            }
        }
        let _ = std::fs::remove_file(&self.marker);
    }
}

/// Keeps WeChat's UI exposed while `on`, and puts it back otherwise.
pub(super) struct Keeper {
    folder: PathBuf,
    gate: Option<Gate>,
    /// The WeChat process the byte could not be found in; not tried again until WeChat restarts.
    failed: Option<u32>,
    next: Option<Instant>,
    /// What the settings show about it; `None` while off.
    pub(super) status: Option<String>,
}

impl Keeper {
    pub(super) fn new(folder: PathBuf) -> Self {
        Self {
            folder,
            gate: None,
            failed: None,
            next: None,
            status: None,
        }
    }

    /// Call often; acts every few seconds, looking WeChat's main window up with `window`.
    /// Returns whether `status` changed.
    pub(super) fn tick(&mut self, on: bool, window: impl FnOnce() -> Option<HWND>) -> bool {
        if !on {
            return self.off();
        }
        if self.next.is_some_and(|next| Instant::now() < next) {
            return false;
        }
        self.next = Some(Instant::now() + CHECK);
        let status = self.keep_on(window());
        self.set_status(Some(status))
    }

    /// Whether the island has WeChat's UI exposed right now.
    pub(super) fn is_on(&self) -> bool {
        self.gate.is_some()
    }

    pub(super) fn off(&mut self) -> bool {
        if let Some(gate) = self.gate.take() {
            gate.restore();
        }
        self.failed = None;
        self.next = None;
        self.set_status(None)
    }

    fn set_status(&mut self, status: Option<String>) -> bool {
        let changed = self.status != status;
        self.status = status;
        changed
    }

    fn keep_on(&mut self, window: Option<HWND>) -> String {
        let Some(window) = window else {
            return "没找到微信主窗口，微信启动后会自动公开。".into();
        };
        let process_id = process::window_process_id(window);
        if self.gate.is_none() {
            self.gate = adopt(process_id, &self.folder);
        }
        if self
            .gate
            .as_ref()
            .is_some_and(|gate| gate.process_id == process_id && gate.is_on())
        {
            return ON.into();
        }
        // A WeChat that exited took its byte with it.
        self.gate = None;
        if let Some(error) = self
            .failed
            .filter(|failed| *failed == process_id)
            .and(self.status.clone())
        {
            return error;
        }
        if uia_list::shows_qt_controls(window) {
            return "微信界面已被别的程序（例如读屏软件）公开。".into();
        }
        match activate(process_id, &self.folder, || {
            uia_list::shows_qt_controls(window)
        }) {
            Ok(gate) => {
                self.gate = Some(gate);
                ON.into()
            }
            Err(error) => {
                self.failed = Some(process_id);
                format!("没能公开微信界面：{error}")
            }
        }
    }
}

const ON: &str = "已公开微信界面。微信关在托盘里时读不到会话列表，最小化可以。";

/// The byte an earlier run left on in WeChat process `process_id`, if any.
fn adopt(process_id: u32, folder: &Path) -> Option<Gate> {
    let marker = folder.join("gate-on.json");
    let left: Value = serde_json::from_slice(&std::fs::read(&marker).ok()?).ok()?;
    let address = left["address"].as_u64()? as usize;
    let same = left["pid"].as_u64() == Some(u64::from(process_id));
    if !same || ProcessMemory::open(process_id)?.read_byte(address) != Some(1) {
        // WeChat restarted since, which put the byte back by itself.
        let _ = std::fs::remove_file(&marker);
        return None;
    }
    Some(Gate {
        process_id,
        address,
        original: 0,
        marker,
    })
}

/// Sets the byte in WeChat process `process_id` and waits until `exposed()` says the controls
/// show. Addresses come from the cache in `folder`, else from scanning Weixin.dll on disk (about
/// 200 MB, a few seconds, once per WeChat version).
fn activate(process_id: u32, folder: &Path, exposed: impl Fn() -> bool) -> Result<Gate, String> {
    let (base, dll) = process_memory::module(process_id, "Weixin.dll")
        .ok_or("微信进程里没有 Weixin.dll（不是 4.x 版？）")?;
    let memory = ProcessMemory::open(process_id)
        .ok_or("打不开微信进程（微信以管理员身份运行时，岛也要以管理员身份运行）")?;
    let cache_path = folder.join("gate-cache.json");
    let mut cache = std::fs::read(&cache_path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({}));
    let identity = dll_identity(&dll);
    let entry = &cache[&identity];
    let verified = entry["verified"].as_u64().map(|rva| rva as u32);
    let scanned: Vec<u32> = match entry["candidates"].as_array() {
        Some(list) => list
            .iter()
            .filter_map(|rva| rva.as_u64().map(|rva| rva as u32))
            .collect(),
        None => {
            let data =
                std::fs::read(&dll).map_err(|error| format!("读不到 Weixin.dll：{error}"))?;
            let found = scan(&data);
            cache[&identity] = json!({ "candidates": found });
            save(&cache_path, &cache);
            found
        }
    };
    let mut candidates: Vec<u32> = verified.into_iter().collect();
    candidates.extend(
        scanned
            .into_iter()
            .filter(|rva| Some(*rva) != verified)
            .take(MAX_TRIES),
    );
    if candidates.is_empty() {
        return Err("这个版本的微信里没找到辅助功能开关".into());
    }
    for rva in candidates {
        let address = base + rva as usize;
        let Some(original) = memory.read_byte(address) else {
            continue;
        };
        if original != 1 && !memory.write_byte(address, 1) {
            continue;
        }
        if wait_for(&exposed, Duration::from_secs(2)) {
            cache[&identity]["verified"] = json!(rva);
            save(&cache_path, &cache);
            let marker = folder.join("gate-on.json");
            if original != 1 {
                save(&marker, &json!({ "pid": process_id, "address": address }));
            }
            return Ok(Gate {
                process_id,
                address,
                original,
                marker,
            });
        }
        if original != 1 {
            memory.write_byte(address, original);
        }
    }
    Err("改了开关，微信的界面仍然没有公开".into())
}

fn wait_for(done: &impl Fn() -> bool, limit: Duration) -> bool {
    let start = Instant::now();
    loop {
        if done() {
            return true;
        }
        if start.elapsed() >= limit {
            return false;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

fn save(path: &Path, cache: &Value) {
    if let Some(folder) = path.parent() {
        let _ = std::fs::create_dir_all(folder);
    }
    if let Err(error) = std::fs::write(path, cache.to_string()) {
        eprintln!("gate cache not saved: {error}");
    }
}

/// Changes with the WeChat version: its folder, the file size and time.
fn dll_identity(dll: &Path) -> String {
    let folder = dll
        .parent()
        .and_then(Path::file_name)
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let meta = std::fs::metadata(dll).ok();
    let size = meta.as_ref().map_or(0, std::fs::Metadata::len);
    let time = meta
        .and_then(|meta| meta.modified().ok())
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |time| time.as_secs());
    format!("{folder}|{size}|{time}")
}

struct Section {
    rva: u32,
    size: u32,
    raw: usize,
    raw_size: usize,
    flags: u32,
}

fn u16_at(data: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_le_bytes(data.get(at..at + 2)?.try_into().ok()?))
}
fn u32_at(data: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(data.get(at..at + 4)?.try_into().ok()?))
}

fn sections(data: &[u8]) -> Vec<Section> {
    let parse = || -> Option<Vec<Section>> {
        let pe = u32_at(data, 0x3C)? as usize;
        if data.get(pe..pe + 4)? != b"PE\0\0" {
            return None;
        }
        let count = u16_at(data, pe + 6)? as usize;
        let first = pe + 24 + u16_at(data, pe + 20)? as usize;
        (0..count)
            .map(|i| {
                let at = first + i * 40;
                Some(Section {
                    size: u32_at(data, at + 8)?,
                    rva: u32_at(data, at + 12)?,
                    raw_size: u32_at(data, at + 16)? as usize,
                    raw: u32_at(data, at + 20)? as usize,
                    flags: u32_at(data, at + 36)?,
                })
            })
            .collect()
    };
    parse().unwrap_or_default()
}

/// The gate's RVA candidates in Weixin.dll's bytes, most likely first. The gate is
/// read by `test rcx,rcx; jz ..; cmp byte ptr [rip+disp32],0; jz ..`; matches closest
/// to a `lea reg,[rip+..]` of "qt.accessibility.core" win.
fn scan(data: &[u8]) -> Vec<u32> {
    let sections = sections(data);
    let code = || {
        sections
            .iter()
            .filter(|s| s.flags & EXECUTE != 0)
            .filter_map(|s| {
                let bytes = data.get(s.raw..(s.raw + s.raw_size).min(data.len()))?;
                Some((s.rva, bytes))
            })
    };
    let writable = |rva: u32| {
        sections.iter().any(|s| {
            s.flags & WRITE != 0 && (s.rva..s.rva + s.size.max(s.raw_size as u32)).contains(&rva)
        })
    };
    let core = data
        .windows(CORE_STRING.len())
        .position(|window| window == CORE_STRING)
        .and_then(|offset| {
            sections
                .iter()
                .find(|s| (s.raw..s.raw + s.raw_size).contains(&offset))
                .map(|s| s.rva + (offset - s.raw) as u32)
        });
    let mut xrefs = Vec::new();
    if let Some(core) = core {
        for (rva, bytes) in code() {
            for i in 0..bytes.len().saturating_sub(6) {
                if bytes[i] == 0x8D && bytes[i + 1] & 0xC7 == 0x05 {
                    let disp = i32::from_le_bytes([
                        bytes[i + 2],
                        bytes[i + 3],
                        bytes[i + 4],
                        bytes[i + 5],
                    ]);
                    if (rva as i64 + i as i64 + 6 + disp as i64) == core as i64 {
                        xrefs.push(rva + i as u32);
                    }
                }
            }
        }
    }
    let mut found: Vec<(u32, u32)> = Vec::new();
    for (rva, bytes) in code() {
        for i in 0..bytes.len().saturating_sub(18) {
            let b = &bytes[i..i + 18];
            if b[..5] == [0x48, 0x85, 0xC9, 0x0F, 0x84]
                && b[9..11] == [0x80, 0x3D]
                && b[15..18] == [0x00, 0x0F, 0x84]
            {
                let at = rva + i as u32;
                let disp = i32::from_le_bytes([b[11], b[12], b[13], b[14]]);
                let target = (at as i64 + 9 + 7 + disp as i64) as u32;
                if writable(target) {
                    let distance = xrefs
                        .iter()
                        .map(|x| x.abs_diff(at))
                        .min()
                        .unwrap_or(u32::MAX);
                    found.push((distance, target));
                }
            }
        }
    }
    found.sort_by_key(|(distance, _)| *distance);
    let near: Vec<u32> = found
        .iter()
        .filter(|(distance, _)| *distance <= NEAR)
        .map(|(_, target)| *target)
        .collect();
    let mut ordered = if near.is_empty() {
        found.into_iter().map(|(_, target)| target).collect()
    } else {
        near
    };
    let mut seen = std::collections::HashSet::new();
    ordered.retain(|rva| seen.insert(*rva));
    ordered
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A PE with a code section at RVA 0x1000 (file 0x200) and a data section at 0x3000 (file 0x400).
    fn image(code: &[u8], data: &[u8]) -> Vec<u8> {
        let mut bytes = vec![0u8; 0x600];
        bytes[0x3C..0x40].copy_from_slice(&0x80u32.to_le_bytes());
        bytes[0x80..0x84].copy_from_slice(b"PE\0\0");
        bytes[0x86..0x88].copy_from_slice(&2u16.to_le_bytes());
        bytes[0x94..0x96].copy_from_slice(&0xF0u16.to_le_bytes());
        for (i, (rva, raw, flags)) in [(0x1000u32, 0x200u32, EXECUTE), (0x3000, 0x400, WRITE)]
            .into_iter()
            .enumerate()
        {
            let at = 0x80 + 24 + 0xF0 + i * 40;
            bytes[at + 8..at + 12].copy_from_slice(&0x200u32.to_le_bytes());
            bytes[at + 12..at + 16].copy_from_slice(&rva.to_le_bytes());
            bytes[at + 16..at + 20].copy_from_slice(&0x200u32.to_le_bytes());
            bytes[at + 20..at + 24].copy_from_slice(&raw.to_le_bytes());
            bytes[at + 36..at + 40].copy_from_slice(&flags.to_le_bytes());
        }
        bytes[0x200..0x200 + code.len()].copy_from_slice(code);
        bytes[0x400..0x400 + data.len()].copy_from_slice(data);
        bytes
    }

    fn gate_check(at: u32, target: u32) -> Vec<u8> {
        let disp = (target as i64 - (at as i64 + 16)) as i32;
        let mut b = vec![0x48, 0x85, 0xC9, 0x0F, 0x84, 1, 0, 0, 0, 0x80, 0x3D];
        b.extend(disp.to_le_bytes());
        b.extend([0x00, 0x0F, 0x84]);
        b
    }

    #[test]
    fn finds_the_gate_next_to_the_logging_category() {
        // Two gate-shaped checks: one far from the string's lea (at 0x1000), one right after it (at 0x1100).
        let mut code = vec![0x90u8; 0x200];
        code[..18].copy_from_slice(&gate_check(0x1000, 0x3080));
        let lea_disp = (0x3010i64 - (0x10F0 + 6)) as i32; // lea rcx,[rip+..] -> "qt.accessibility.core" at 0x3010
        code[0xEF..0xF6].copy_from_slice(&[0x48, 0x8D, 0x0D, 0, 0, 0, 0]);
        code[0xF2..0xF6].copy_from_slice(&lea_disp.to_le_bytes());
        code[0x100..0x112].copy_from_slice(&gate_check(0x1100, 0x3040));
        let mut data = vec![0u8; 0x80];
        data[0x10..0x10 + CORE_STRING.len()].copy_from_slice(CORE_STRING);
        let found = scan(&image(&code, &data));
        assert_eq!(found, [0x3040, 0x3080]);
    }

    #[test]
    fn ignores_targets_outside_writable_memory() {
        let mut code = vec![0x90u8; 0x200];
        code[..18].copy_from_slice(&gate_check(0x1000, 0x1180));
        assert!(scan(&image(&code, &[])).is_empty());
        assert!(scan(b"not a PE").is_empty());
    }
}
