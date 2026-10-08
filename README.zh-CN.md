# MotionCraft — AI Motion Studio

[English](README.md) | [简体中文](README.zh-CN.md)

节点式分镜编排工作台：拖拽节点 → 连线 → **HTML/CSS/JS 合成可播放短片** → 导出视频。  
支持多厂商 LLM API Key、规则伪 AI 兜底，以及 **MCP 桥接**（Cursor / 豆包等可远程操作）。

## 环境要求

- Windows 10/11
- [Visual Studio 2022](https://visualstudio.microsoft.com/)（启用「.NET 桌面开发」）
- .NET 8 SDK
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)（Win11 一般已自带）
- Node.js 18+（仅 MCP 需要）

## 用 VS2022 编译运行

1. 打开 `MotionCraft.sln`
2. 设启动项目为 `MotionCraft.Host`
3. **F5** 运行，或 `生成 → 生成解决方案`
4. 输出：`src/MotionCraft.Host/bin/Debug/net8.0-windows/MotionCraft.exe`

命令行：

```powershell
dotnet build MotionCraft.sln -c Release
dotnet run --project src/MotionCraft.Host -c Release
```

也可先用浏览器直接打开 `www/index.html` 调试前端（无宿主菜单/MCP 桥时功能仍可用，AI 导演会走规则伪 AI）。

## 快速使用

1. **模板** 或 **✨ AI导演** 生成分镜（模型输出每镜 HTML/CSS/JS 的 `draw()`）
2. 左侧拖节点、端口连线；**素材** 可导入图片/视频/音频并挂到分镜
3. **▶ 预览** / **导出**（录制与绘制同一帧循环，优先 MP4）
4. 底部时间轴点击可跳转；右侧可编辑模型代码或导入资源

### 快捷键

| 键 | 作用 |
|----|------|
| Ctrl+N / O / S | 新建 / 打开 / 保存 |
| Delete | 删除选中节点或连线 |
| Esc | 关闭预览 |
| 空格 | 预览 / 暂停 |
| Space+拖拽 | 平移画布 |

时长：顶栏 **1–600 秒**。

## API / 多厂商

菜单 **工具 → API / 模型设置**，或界面「设置」：

| 厂商 | 说明 |
|------|------|
| OpenAI | `https://api.openai.com/v1` |
| Anthropic | 注意浏览器 CORS，建议后续加宿主代理 |
| 豆包 | 火山方舟 OpenAI 兼容端点 |
| DeepSeek | OpenAI 兼容 |
| 自定义 | 任意 OpenAI Compatible（如 Ollama） |

密钥保存在 `%AppData%\MotionCraft\settings.json`，字段为 `apiKeyProtected`（**Windows DPAPI 当前用户加密**），明文不会落盘；**不写入项目文件**。  
HTTP/MCP 的 `/settings` 接口只返回 `hasKey` / `keyMask`，不返回明文。  
设置入口：应用内「设置」、或菜单 **工具 → API / 模型设置**（推荐，含测试连接）。

## MCP（Cursor / 豆包）

保持 **MotionCraft.exe 运行**，然后：

```powershell
cd mcp
npm install
```

在应用内 **工具 → 复制 MCP 配置**，粘贴到 Cursor 的 MCP 设置。示例：

```json
{
  "mcpServers": {
    "motioncraft": {
      "command": "node",
      "args": ["C:/Projects/MotionCraft/mcp/server.js"],
      "env": {
        "MOTIONCRAFT_BRIDGE": "http://127.0.0.1:17865"
      }
    }
  }
}
```

端口以应用实际桥接为准（启动后写入 settings）。

### MCP 工具

`health` · `get_project` · `set_project` · `list_nodes` · `add_node` · `connect` · `update_props` · `run_director` · `run_scene_director` · `run_character_director` · `run_chart_director` · `run_effect_director` · `preview` · `export_video`

## 成片原理

```
提示词 → 大模型（或代码兜底生成器）
           ↓
     每镜 HTML + CSS + JS（含 draw(t)）
           ↓
     Composer 注入并按时间轴执行 draw() → 像素帧
           ↓
     canvas.captureStream + MediaRecorder → 视频文件
```

**像素画面由大模型给出的 HTML/CSS/JS 代码绘制**（每帧 `draw`）。宿主只做节点编排、时间轴、注入执行与录制；无 API Key 时本地仍会**生成代码字符串再执行**，而不是用写死的场景模板直接画图。

## 文档

- 设计规格：`docs/superpowers/specs/2026-10-08-ai-motion-studio-design.md`
- 实现计划：`docs/superpowers/plans/2026-10-08-ai-motion-studio.md`
- 导演质量宪法：`docs/prompts/motioncraft-system-prompt.md`
- 镜头 JSON Schema：`docs/prompts/shot.schema.json`（运行时注入见 `www/js/quality-prompt.js`）

## 许可

私有项目，按需使用。
