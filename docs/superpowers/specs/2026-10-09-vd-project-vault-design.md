# .vd 工程文件与启动门禁设计

**日期:** 2026-10-09  
**状态:** 已批准（方案 A）

## 目标

软件启动后必须新建或打开 `.vd` 工程才能操作；工程为加密单文件，默认目录为 exe 旁 `project\`。

## 决策

| 项 | 选择 |
|----|------|
| 加密 | 应用内置密钥 AES-GCM，用户无感 |
| 门禁 | 前端全屏遮罩，确认前不可操作 |
| 目录 | 启动创建 `project\`；对话框默认该目录，可选任意路径 |
| 格式 | 仅 `.vd`；不再打开/保存 `.motioncraft.json` |
| 职责 | 宿主加解密与对话框；前端工程态与遮罩 |

## `.vd` 二进制布局

```
MCVD (4) | version=1 (1) | nonce (12) | tag (16) | ciphertext (N)
```

明文为 UTF-8 工程 JSON（与现有 `createEmptyProject` schema 一致）。密钥由宿主内置字符串经 SHA-256 派生，不进入前端。

## 会话流

1. 启动 → 确保 `project\` 存在 → WebView 加载 → 前端显示门禁遮罩（`sessionOpen=false`）
2. 新建 → SaveFileDialog（默认 `project\`）→ 写空工程 `.vd` → 注入 JSON → `sessionOpen=true`，记住路径
3. 打开 → OpenFileDialog（`*.vd`）→ 解密 → 注入 → 解锁
4. 保存 → 有路径则覆盖；无路径则另存为
5. 应用级 API Key 仍在 `%AppData%`，不写入 `.vd`

## 非目标（本期）

- 用户密码 / DPAPI 绑定工程
- 旧 JSON 导入
- zip 分离媒体资源
