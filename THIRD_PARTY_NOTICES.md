# Third-party notices / 第三方声明

FocuSD Island includes material derived from the following projects. Their licenses apply to that material.

本项目包含源自以下项目的内容，这些内容适用各自的许可证。

## wechatauto-replica

- Used in: `src-tauri/src/wechat_reminders/gate.rs` — the approach of switching on WeChat 4.x's Qt accessibility by setting one byte in `Weixin.dll`, and the instruction pattern used to find that byte (from `wake_uia.py`).
- 用于：`src-tauri/src/wechat_reminders/gate.rs`——通过改 `Weixin.dll` 里一个字节打开微信 4.x 的 Qt 辅助功能的做法，以及查找这个字节用的指令特征（来自 `wake_uia.py`）。
- License: Apache License 2.0 — https://www.apache.org/licenses/LICENSE-2.0

The code in `gate.rs` was rewritten in Rust and changed (address cache, restoring the byte, one candidate tried); it is not a copy of the original file.

`gate.rs` 是用 Rust 重写并修改过的（地址缓存、写回原值、只试一个候选），不是原文件的拷贝。
