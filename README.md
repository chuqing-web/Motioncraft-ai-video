# MotionCraft — AI Motion Studio

[English](README.md) | [简体中文](README.zh-CN.md)

**Prompt → editable Canvas code → real short film.**  
A Windows desktop workbench that turns natural language into cinematic clips by having an LLM write **runnable per-shot code** — then you preview, scrub, revise, and export MP4/WebM locally.

> Not a black-box “text-to-video” API. The model is a **procedural director**; MotionCraft is the studio, timeline, and recorder.

---

## Screenshots

![AI generation process](picture/AI%20generation%20process.png)

*AI Director streaming outline + per-shot code*

![Video effect](picture/video%20effect.png)

*Preview stage: camera, atmospheric FX, timeline*

---

## Why MotionCraft wins

### 1. Transparent & controllable — not opaque pixels

| Traditional AI video | **MotionCraft** |
|----------------------|-----------------|
| Cloud model returns a sealed clip | Every shot is `html` / `css` / `js` you can read, edit, regenerate |
| Hard to fix one second mid-timeline | Time `t` drives every frame; scrub and iterate |
| Locked in a vendor website | Local `.exe` + node graph + MCP remote control |
| One-shot “hope it looks good” | Outline → per-shot code → validate → bounce → attachments |
| Vendor chooses the model | **Bring your own API** — swap providers anytime |

You stay in control of story, code, timing, and which model bills the tokens.

### 2. Low hardware bar — laptop-friendly

MotionCraft does **not** run a local diffusion/video model and does **not** need a datacenter GPU for generation.

| What you need | What you don’t need |
|---------------|---------------------|
| Ordinary Windows 10/11 PC | High-end NVIDIA for local T2V |
| WebView2 (usually already on Win11) | Multi‑GB video checkpoints |
| Any LLM API (or local Ollama-compatible) | Always-online proprietary video SaaS |
| Modest CPU/RAM for Canvas 2D + UI | 24 GB+ VRAM “AI workstation” |

**Generation** = call your chosen LLM (cloud or local OpenAI-compatible).  
**Playback / export** = Canvas 2D + `MediaRecorder` on the machine you already own.

That means lower cost, fewer drivers, and workable setups on school/office laptops.

### 3. Any API you already pay for

Configure under **Tools → API / Model Settings**. OpenAI-compatible endpoints work out of the box:

| Slot | Typical use |
|------|-------------|
| **OpenAI** | Official `api.openai.com` |
| **Anthropic** | Claude (note browser CORS on some setups) |
| **Doubao (豆包)** | Volcengine Ark OpenAI-compatible |
| **DeepSeek** | OpenAI-compatible |
| **Custom** | Ollama, vLLM, OneAPI, OpenRouter, company gateways, self-hosted Hermes-compatible proxies — anything with `/v1/chat/completions` |

Keys stay in `%AppData%\MotionCraft\settings.json` as **DPAPI-protected** `apiKeyProtected` — not inside `.vd` projects, never returned as plaintext over MCP.

Switch default vendor anytime; Director can also **auto-fallback** to any configured key so a single-node generate doesn’t fail with `NO_KEY` because the key sits on another slot.

### 4. Agents & IDEs can drive the whole studio

With MotionCraft running, any **MCP client** can outline, generate scenes/characters/effects, mutate the graph, preview, and export — same quality pipeline as the UI:

- **Cursor**  
- **Doubao (豆包)** agent / plugin MCP  
- **Hermes Agent** (or other agent stacks that speak MCP / HTTP bridge)  
- **小龙虾** and similar desktop agents that can host MCP servers  
- Custom scripts hitting the local bridge (`127.0.0.1`)

You choose: click in the UI, or let an agent run `run_director` / `run_effect_director` / `export_video` while you review the graph.

### 5. Quality pipeline built for “real short film” feel

Injected constitution (`www/js/quality-prompt.js`): deep thinking, word-level prompt fidelity, cinematic layers, character performance, deterministic `seed()` (no `Math.random`), maximal dense code toward output limits, bounce-on-compile/dry-run failure.  
See [`docs/prompts/motioncraft-system-prompt.md`](docs/prompts/motioncraft-system-prompt.md).

---

## Product advantages (checklist)

- **Editable intermediate art** — code is the asset; regenerate one shot without losing the rest  
- **Deterministic timeline** — scrub preview matches export  
- **Node graph** — sequence shots, attach camera / FX / character / VO  
- **Streaming Director UI** — one panel for outline + per-shot progress (also `/ai-progress` for agents)  
- **Local privacy** — encrypted `.vd` vaults + DPAPI keys  
- **Export beside project** — MP4 preferred, WebM fallback, next to the open `.vd` when possible  
- **Offline-capable rendering** — once code exists, play/export without calling the LLM again  
- **BYO model economics** — use cheap/local models for drafts, stronger models for hero shots  

---

## What you get

### Node-based storyboard studio

| Area | Role |
|------|------|
| Left | Node library: scene, text, image, video, character, chart, effect, audio, narration, camera, AI |
| Center | Graph — drag, `sequence` (order) / `attach` (overlay) |
| Right | Props — prompts, layout, generated `html` / `css` / `js` |
| Bottom | Timeline — seek, scrub, playhead |

### AI Director pipeline

1. **Outline** — shot count and each shot’s duration follow the **user prompt** (UI duration is only a fallback); cinematic fields (style, light, camera, effects…)  
2. **Per-shot code** — IIFE → `{ setup, draw }`  
3. **Prompt fidelity** — meaningful words must land on screen  
4. **Validate & bounce** — compile + dry-run; fix seed / DOM / undefined vars via retries  
5. **Attachments** — camera, full-bleed FX, character performance, narration  

Single-node AI (scene / character / effect / chart) uses the same contracts and **connection continuity** (host scene + neighbors).

### Composer & export

- Host clock `t` (seconds); scenes must **not** start their own `requestAnimationFrame`  
- Camera + letterbox/vignette; atmospheric FX full-bleed (no hard “panel” boxes)  
- Record the same paint loop as preview → video file  

---

## Architecture

```
WinForms.exe + WebView2
  └─ www/ workbench
       ├─ Graph · Props · Timeline · Stream UI
       ├─ Director (multi-vendor router + quality prompts)
       ├─ Composer (compile IIFE → paint frames)
       └─ Export (captureStream + MediaRecorder)
Local HTTP Bridge (127.0.0.1)
  └─ MCP Server (stdio)
       ← Cursor / Doubao / Hermes Agent / 小龙虾 / custom agents
```

**Pixel contract:** only model (or local synthesizer) `draw()` paints the frame. Host supplies canvas, clock, overlays, recording.

```
Prompt → Your LLM API (Doubao / DeepSeek / OpenAI / Ollama / …)
           ↓
     Per-shot HTML + CSS + JS  (IIFE → { setup, draw })
           ↓
     Composer: validate → dry-run → paint draw({ t })
           ↓
     Overlays: camera · character · effect · narration · …
           ↓
     captureStream + MediaRecorder → video next to .vd
```

---

## Quick start

1. Build & run the Host (below)  
2. **New** or **Open** a `.vd` project  
3. **Tools → API / Model Settings** — paste any OpenAI-compatible base URL + key + model  
4. Open **AI Director**, write a cinematic prompt, generate  
5. Inspect each scene’s `js`, scrub timeline, tweak or regenerate one node  
6. **Export** — file lands beside the `.vd` when a project path exists  

### Shortcuts

| Key | Action |
|-----|--------|
| Ctrl+N / O / S | New / Open / Save `.vd` |
| Delete | Delete selected node or edge |
| Esc | Close preview |
| Space | Preview / Pause |
| Space + drag | Pan canvas |

Duration: **1–600 s** (top bar).

---

## Requirements (keep it light)

**Minimum practical setup**

- Windows 10/11  
- [.NET 8](https://dotnet.microsoft.com/) + [Visual Studio 2022](https://visualstudio.microsoft.com/) (“.NET Desktop Development”) *or* `dotnet` CLI  
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (usually preinstalled on Windows 11)  
- Network access to **your** LLM endpoint (or local Ollama)  

**Optional**

- Node.js 18+ — only if you use the **MCP** server for Cursor / agents  

**Not required for core use**

- Dedicated AI GPU / local Stable Video / Runway-class hardware  
- Vendor-locked video subscription (unless you choose that API yourself)  

---

## Build & run

**Visual Studio 2022**

1. Open `MotionCraft.sln`  
2. Startup project: `MotionCraft.Host`  
3. **F5**  
4. Output: `src/MotionCraft.Host/bin/Debug/net8.0-windows/MotionCraft.exe`  

**CLI**

```powershell
dotnet build MotionCraft.sln -c Release
dotnet run --project src/MotionCraft.Host -c Release
```

Browser-only: open `www/index.html` for frontend debugging (no host menus / MCP; AI falls back to rule synthesizers without a host-injected key).

---

## API setup (Doubao, DeepSeek, Custom, …)

1. **Tools → API / Model Settings**  
2. Fill **base URL**, **model id**, **API key** for the vendor you use  
3. Set **default vendor**, or leave Director on **auto** (uses any slot that has a key)  

Examples:

| Goal | baseUrl (typical) |
|------|-------------------|
| Doubao / Ark | `https://ark.cn-beijing.volces.com/api/v3` |
| DeepSeek | `https://api.deepseek.com/v1` |
| OpenAI | `https://api.openai.com/v1` |
| Local Ollama | `http://127.0.0.1:11434/v1` |
| Company gateway | Your OpenAI-compatible proxy URL |

Anthropic uses its native Messages API path in the router. Everything else goes through OpenAI-compatible chat completions (`max_tokens` raised for dense shot code).

---

## MCP & agent control

1. Keep **MotionCraft.exe** running (bridge listens on `127.0.0.1`, port stored in settings)  
2. `cd mcp && npm install`  
3. **Tools → Copy MCP Config** → paste into Cursor / Doubao / Hermes / 小龙虾 / other MCP host  

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

Use the bridge port written at startup (example `17865` may differ).

### Tools

`health` · `get_project` · `set_project` · `list_nodes` · `add_node` · `connect` · `update_props` · `run_director` · `run_scene_director` · `run_character_director` · `run_chart_director` · `run_effect_director` · `preview` · `export_video`

Agents can regenerate a single effect node, rewrite one scene, or run a full director pass — you keep the graph as source of truth.

---

## Node types

| Type | Role |
|------|------|
| `scene` | Main shot — model `html/css/js` paints the world |
| `camera` | Pan / zoom / handheld / tilt; letterbox + soft vignette |
| `effect` | Full-bleed rain / glow / particles / spark / fade |
| `character` | Attached performer — ground layout, expression + motion |
| `narration` / `text` | VO lower-third or captions |
| `chart` / `image` / `video` / `audio` | Data viz & media |
| `ai` | Director prompt / provider metadata |

Edges: **`sequence`** (shot order), **`attach`** (overlay on a scene).

---

## Docs

- Design: [`docs/superpowers/specs/2026-10-08-ai-motion-studio-design.md`](docs/superpowers/specs/2026-10-08-ai-motion-studio-design.md)  
- Plan: [`docs/superpowers/plans/2026-10-08-ai-motion-studio.md`](docs/superpowers/plans/2026-10-08-ai-motion-studio.md)  
- Quality constitution: [`docs/prompts/motioncraft-system-prompt.md`](docs/prompts/motioncraft-system-prompt.md)  
- Shot schema: [`docs/prompts/shot.schema.json`](docs/prompts/shot.schema.json)  

---

## License

Private project. Use as needed.
