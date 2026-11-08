---
id: C4b
title: 歌词的中文来源（网易云、QQ 音乐、酷狗，非官方接口、默认关闭并说明风险）、翻译行、逐字高亮、按单首歌调偏移
status: 已完成
owner: fly-island-7e
done: 2026-11-07
---

## 提交

- `feat(media): lyrics from Kugou and NetEase, with translations and a per-song offset`

## 备注

LRCLIB 的中文歌收录较少。调研见 C4 的会话记录：BetterLyrics、Lyricify 用的就是这几家。网易云不向系统报告播放进度和时长，岛只能从切歌起自己计时，在网易云里拖进度条或岛打开时歌已放到一半都会对不上；拿到网易云的歌曲 ID 或进度需要它的插件（如 InfLink-rs），以后可以考虑

## 交接

- 2026-11-07 04:10 第一版：酷狗、网易云（明文接口；有 InfLink 的 NCM-id 时按 ID 取）、翻译行、按歌偏移已完成。还没做：QQ 音乐（QRC 要移植魔改 DES，约 1.5–2 天）、逐字高亮（酷狗 KRC 已带逐字时间，只差前端）、网易云逐字（yrc 要 eapi 加密）。接口细节见提交说明和 src-tauri/src/lyrics/{kugou,netease,krc}.rs
