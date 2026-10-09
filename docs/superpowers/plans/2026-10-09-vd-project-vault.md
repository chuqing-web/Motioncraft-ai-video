# .vd Project Vault Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Require New/Open of encrypted `.vd` projects before editing; default dir `project\` beside exe.

**Architecture:** Host (`ProjectVault` + `MainForm`) owns AES-GCM files and dialogs; frontend owns fullscreen gate and `sessionOpen`.

**Tech Stack:** .NET 8 WinForms, WebView2, AES-GCM, vanilla JS

---

### Task 1: ProjectVault.cs
- [x] Magic/version/nonce/tag layout + EmptyProjectJson + ProjectDir

### Task 2: MainForm file session
- [x] `_currentProjectPath`, New/Open/Save/SaveAs with `*.vd`
- [x] Notify frontend `openProjectSession`

### Task 3: Frontend gate
- [x] Overlay UI + CSS
- [x] `sessionOpen` gate; unlock on host load

### Task 4: Wire menus / shortcuts
- [x] Replace JSON filters; new → host dialog
