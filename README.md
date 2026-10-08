# MotionCraft — AI Motion Studio

[English](README.md) | [简体中文](README.zh-CN.md)

Node-based storyboard workbench: drag nodes → connect → **compose playable shorts with HTML/CSS/JS** → export video.  
Supports multi-vendor LLM API keys, rule-based pseudo-AI fallback, and an **MCP bridge** (remote control from Cursor, Doubao, and similar clients).

## Requirements

- Windows 10/11
- [Visual Studio 2022](https://visualstudio.microsoft.com/) (enable “.NET Desktop Development”)
- .NET 8 SDK
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (usually preinstalled on Windows 11)
- Node.js 18+ (MCP only)

## Build & Run (VS2022)

1. Open `MotionCraft.sln`
2. Set startup project to `MotionCraft.Host`
3. Press **F5**, or use **Build → Build Solution**
4. Output: `src/MotionCraft.Host/bin/Debug/net8.0-windows/MotionCraft.exe`

CLI:

```powershell
dotnet build MotionCraft.sln -c Release
dotnet run --project src/MotionCraft.Host -c Release
```

You can also open `www/index.html` in a browser to debug the frontend (host menus / MCP bridge unavailable; AI Director falls back to rule-based pseudo-AI).

## Quick Start

1. Use a **template** or **✨ AI Director** to generate storyboards (the model outputs per-shot HTML/CSS/JS with `draw()`)
2. Drag nodes on the left and connect ports; **Assets** can import images/video/audio and attach them to shots
3. **▶ Preview** / **Export** (recording and drawing share the same frame loop; MP4 preferred)
4. Click the bottom timeline to seek; edit model code or import resources on the right

### Shortcuts

| Key | Action |
|-----|--------|
| Ctrl+N / O / S | New / Open / Save |
| Delete | Delete selected node or connection |
| Esc | Close preview |
| Space | Preview / Pause |
| Space + drag | Pan canvas |

Duration: top bar **1–600 seconds**.

## API / Multi-Vendor

Menu **Tools → API / Model Settings**, or the in-app Settings:

| Provider | Notes |
|----------|--------|
| OpenAI | `https://api.openai.com/v1` |
| Anthropic | Browser CORS may apply; a host proxy is recommended later |
| Doubao | Volcengine Ark OpenAI-compatible endpoint |
| DeepSeek | OpenAI-compatible |
| Custom | Any OpenAI-compatible endpoint (e.g. Ollama) |

Keys are stored in `%AppData%\MotionCraft\settings.json` as `apiKeyProtected` (**Windows DPAPI, current-user encryption**); plaintext is never written to disk and **never saved into project files**.  
HTTP/MCP `/settings` returns only `hasKey` / `keyMask`, never the raw key.  
Entry points: in-app Settings, or menu **Tools → API / Model Settings** (recommended; includes connection test).

## MCP (Cursor / Doubao)

Keep **MotionCraft.exe** running, then:

```powershell
cd mcp
npm install
```

In the app, use **Tools → Copy MCP Config** and paste into Cursor’s MCP settings. Example:

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

Use the bridge port written to settings at startup.

### MCP Tools

`health` · `get_project` · `set_project` · `list_nodes` · `add_node` · `connect` · `update_props` · `run_director` · `run_scene_director` · `run_character_director` · `run_chart_director` · `run_effect_director` · `preview` · `export_video`

## How Rendering Works

```
Prompt → LLM (or code fallback generator)
           ↓
     Per-shot HTML + CSS + JS (with draw(t))
           ↓
     Composer injects and runs draw() on the timeline → pixel frames
           ↓
     canvas.captureStream + MediaRecorder → video file
```

**Pixels are drawn by the HTML/CSS/JS code produced by the model** (per-frame `draw`). The host only handles node graphing, timeline, injection/execution, and recording. Without an API key, the app still **generates code strings and runs them**, rather than painting from hard-coded scene templates.

## Docs

- Design spec: `docs/superpowers/specs/2026-10-08-ai-motion-studio-design.md`
- Implementation plan: `docs/superpowers/plans/2026-10-08-ai-motion-studio.md`
- Director quality constitution: `docs/prompts/motioncraft-system-prompt.md`
- Shot JSON Schema: `docs/prompts/shot.schema.json` (runtime injection: `www/js/quality-prompt.js`)

## License

Private project. Use as needed.
