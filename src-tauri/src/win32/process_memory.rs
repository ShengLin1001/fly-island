//! Reading and writing single bytes in another process, and finding where a module is loaded in
//! it. Used to switch WeChat's Qt accessibility on (wechat_reminders/gate.rs).

use std::{ffi::c_void, path::PathBuf};

use windows::Win32::{
    Foundation::{CloseHandle, HANDLE},
    System::{
        Diagnostics::{
            Debug::{ReadProcessMemory, WriteProcessMemory},
            ToolHelp::{
                CreateToolhelp32Snapshot, Module32FirstW, Module32NextW, MODULEENTRY32W,
                TH32CS_SNAPMODULE,
            },
        },
        Threading::{
            OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_OPERATION, PROCESS_VM_READ,
            PROCESS_VM_WRITE,
        },
    },
};

/// An open handle to another process's memory, closed on drop.
pub(crate) struct ProcessMemory(HANDLE);

impl ProcessMemory {
    pub(crate) fn open(process_id: u32) -> Option<Self> {
        let access =
            PROCESS_VM_READ | PROCESS_VM_WRITE | PROCESS_VM_OPERATION | PROCESS_QUERY_INFORMATION;
        // SAFETY: OpenProcess takes plain values; a failure returns an error, not a handle.
        unsafe { OpenProcess(access, false, process_id) }
            .ok()
            .map(Self)
    }

    pub(crate) fn read_byte(&self, address: usize) -> Option<u8> {
        let mut byte = 0u8;
        let mut done = 0usize;
        // SAFETY: the handle is open for VM_READ; the target address is only read by the kernel,
        // which fails for unmapped memory, and one byte is written into the valid local `byte`.
        unsafe {
            ReadProcessMemory(
                self.0,
                address as *const c_void,
                (&raw mut byte).cast(),
                1,
                Some(&mut done),
            )
        }
        .ok()?;
        (done == 1).then_some(byte)
    }

    pub(crate) fn write_byte(&self, address: usize, value: u8) -> bool {
        let mut done = 0usize;
        // SAFETY: the handle is open for VM_WRITE; one byte is read from the valid local `value`
        // and the kernel fails for an address not writable in the target.
        let written = unsafe {
            WriteProcessMemory(
                self.0,
                address as *const c_void,
                (&raw const value).cast(),
                1,
                Some(&mut done),
            )
        };
        written.is_ok() && done == 1
    }
}

impl Drop for ProcessMemory {
    fn drop(&mut self) {
        // SAFETY: the handle came from OpenProcess and is closed exactly once.
        let _ = unsafe { CloseHandle(self.0) };
    }
}

/// Where module `name` (e.g. "Weixin.dll") is loaded in process `process_id`: its base address
/// and its path on disk.
pub(crate) fn module(process_id: u32, name: &str) -> Option<(usize, PathBuf)> {
    // SAFETY: CreateToolhelp32Snapshot takes plain values and returns an owned handle, closed below.
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPMODULE, process_id) }.ok()?;
    let mut entry = MODULEENTRY32W {
        dwSize: size_of::<MODULEENTRY32W>() as u32,
        ..Default::default()
    };
    let text = |chars: &[u16]| {
        let end = chars.iter().position(|c| *c == 0).unwrap_or(chars.len());
        String::from_utf16_lossy(&chars[..end])
    };
    let mut found = None;
    // SAFETY: `entry` is a valid MODULEENTRY32W with dwSize set, written by the call.
    let mut more = unsafe { Module32FirstW(snapshot, &mut entry) }.is_ok();
    while more {
        if text(&entry.szModule).eq_ignore_ascii_case(name) {
            found = Some((
                entry.modBaseAddr as usize,
                PathBuf::from(text(&entry.szExePath)),
            ));
            break;
        }
        // SAFETY: as for Module32FirstW.
        more = unsafe { Module32NextW(snapshot, &mut entry) }.is_ok();
    }
    // SAFETY: the snapshot handle is owned here and closed exactly once.
    let _ = unsafe { CloseHandle(snapshot) };
    found
}
