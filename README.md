# MotionCraft — AI Motion Studio

[English](README.md) | [简体中文](README.zh-CN.md)

**Prompt → editable Canvas code → short film *or* print-ready anime pages.**

MotionCraft is a **Windows desktop AI creation workbench**: describe a story in natural language, let an LLM write runnable `html` / `css` / `js` for every shot or comic panel, then preview, revise, and export locally.  
It is not a black-box “text-to-video / text-to-image” website. The model acts as a **procedural director**; MotionCraft is the **studio, timeline / page compositor, and exporter** — transparent, editable, under your control.

---

## What the product is

| | |
|--|--|
| **One line** | Replace sealed pixels with **code that paints** — ship **AI short films** and **AI anime page-comics** |
| **Form factor** | WinForms + WebView2 desktop app (`.exe`); projects are encrypted `.vd` vaults |
| **Generation** | Your own LLM API (Doubao / DeepSeek / OpenAI / Ollama…); local Canvas 2D rendering |
| **Two product lines** | ① Timeline video (MP4/WebM) ② Static page comic (PNG/PDF) |
| **Core asset** | Readable per-shot / per-panel code — not a one-shot cloud blob |

### Problems it solves

| Pain | MotionCraft approach |
|------|----------------------|
| Can’t fix one second of AI video | Nodes + code + single-shot / single-panel regenerate with continuity |
| Outputs are opaque | `html/css/js` is the asset — edit by hand, regenerate, treat as source |
| High GPU / vendor lock-in | Normal Windows laptop; you pick the model and the bill |
| Comics need layout control, not just images | AI chooses panel count / size / position; stream code; export full pages |
| Want Cursor / agents to drive generation | Local MCP bridge — same director pipeline as the UI |

### Who it’s for

- Creators who need **controllable storyboard shorts** or courseware-style clips  
- Story / anime-oriented authors who need **page comics + export**  
- Developers and studios using **agents** (Cursor, Doubao, 小龙虾, …)  
- Teams who care about **local privacy** and project files (encrypted `.vd`)  

---

## Screenshots

![AI generation process](picture/AI%20generation%20process.png)

*AI Director streaming outline + per-shot / per-panel code*

![Video effect](picture/video%20effect.png)

*Video preview: camera, atmospheric FX, timeline*

![AI-generated anime examples](picture/AI-generated%20anime%20examples.png)

*Anime page-comic: code-drawn static panels and page rhythm → PNG / PDF*

---

## Product principles

1. **Code is the picture** — the LLM writes drawing logic, not a sealed media file.  
2. **Director ≠ studio** — the model decides narrative and paint; MotionCraft owns graph, clock/pages, validation, export.  
3. **Bring your own model** — cheap/local for drafts, stronger models for heroes; DPAPI-protected keys, never stored plain in `.vd`.  
4. **Humans and agents share one graph** — UI clicks and MCP tools mutate the same project truth.  
5. **Two media, two constitutions** — video aims for short-film motion; comics aim for print manga craft. Prompts are split on purpose.  

---

## Two pipelines (full comparison)

| | **Video short film** | **Anime / page comic** |
|--|----------------------|-------------------------|
| **Deliverable** | MP4 (preferred) / WebM | PNG sequence / multi-page PDF |
| **Unit** | `scene` + duration | `comic_page` → `comic_panel` → `comic_shot` |
| **Time** | Clock `t` (seconds) drives motion | **Still frames**; pose / speed lines / screentone (no `t` animation) |
| **Layout authority** | Shot count & durations follow the user prompt | **AI decides** panel count, size, and `layout{x,y,w,h}` (no host default grid) |
| **Quality focus** | Cinematic multi-system motion, event beats | One job per panel, shot-size rhythm, ink/tone, designed grids, first-pass correct code |
| **Director** | AI Director / `run_director` | Comic Director / `run_comic_director` |
| **Regen one piece** | Scene / character / effect directors | `run_comic_shot_director` (neighbors + page context) |
| **Preview** | Timeline scrub + play | Flip through composed pages |
| **Export** | Same paint loop as preview → beside `.vd` | Compose pages → PNG or PDF |
| **Same project** | Can coexist with comic nodes; timelines don’t mix | Does not enter video `bakeTimeline` |

---

## Capabilities in depth

### 1. Node-based studio

| Area | Role |
|------|------|
| **Left** | Library: video + comic node types |
| **Center** | Graph: drag, connect, see story structure |
| **Right** | Props: prompts, layout, generated code, per-node regenerate |
| **Bottom** | Video timeline; comic page-flip preview |

Video edges: `sequence`, `attach`.  
Comic edges: `sequence` (pages), `contain` (page→panel), `compose` (panel→shot).

### 2. Video AI Director

1. **Outline** — shot count & durations follow the **user prompt**  
2. **Per-shot code** — IIFE → `{ setup, draw }` with host `t`  
3. **Prompt fidelity** — meaningful words must land on screen  
4. **Validate & bounce** — compile + dry-run; no `Math.random` (use `seed`)  
5. **Attachments** — camera, full-bleed FX, character, narration  

Templates include neon city, daylight product, data demo, and more.

### 3. Anime / page-comic AI Director

1. **Four-level outline (no code)** — work → scene → page task card → panel design card  
2. **AI owns geometry** — `panelCount`, per-panel `size` + precise `layout`; main panel largest; no lazy equal grids  
3. **Stream page → panel** — continuity from neighbors and page tasks  
4. **Manga craft** — bold outer / fine inner lines, screentone, silhouette, bubbles first, one job per panel  
5. **Correctness first** — complete, compiling, dry-runnable html/css/js on first delivery  
6. **Compose & export** — ComicComposer → PNG sequence or PDF  

v1 targets **page comics** (multi-panel pages), not vertical webtoons.

### 4. Models & secrets

- Slots: OpenAI / Anthropic / Doubao / DeepSeek / **Custom** (Ollama, vLLM, OpenRouter, gateways…)  
- Keys: DPAPI-protected in `%AppData%\MotionCraft\settings.json`; MCP never returns plaintext  
- Director default vendor or **auto-fallback** to any slot with a key  

### 5. Agent / MCP control

With `MotionCraft.exe` running, Cursor, Doubao, Hermes Agent, 小龙虾, or custom scripts can read/write the project, run video or comic directors, regenerate one node, preview, and export — **same quality pipeline** as the UI.

### 6. Projects & privacy

- Encrypted local **`.vd` vaults**  
- Offline preview/export once code exists  
- Exports prefer the folder next to the open `.vd`  

---

## Typical workflows

### A. AI short film

1. New/open `.vd`, configure API  
2. **AI Director** — prompt with shot count, timing, mood  
3. Outline → per-shot code → scrub timeline  
4. Regenerate one `scene` / FX / character if needed  
5. **Export** MP4/WebM  

### B. Anime page comic

1. Same API, open **Comic Director** (or comic template)  
2. Story prompt → AI pages/panels (including layouts)  
3. Stream panel code; flip-page preview  
4. Regenerate one `comic_shot` if needed  
5. **Comic export** PNG or PDF  

### C. Agent-driven

1. Keep the desktop app running; paste MCP config  
2. Agent calls `run_director` or `run_comic_director`  
3. You review the graph, edit code, or issue the next command  

---

## Architecture

```
WinForms.exe + WebView2
  └─ www/ workbench
       ├─ Graph · Props · Timeline / Comic flip · Stream AI UI
       ├─ Video Director + Comic Director (split quality prompts)
       ├─ Composer (video) · ComicComposer (static pages)
       └─ Export video · Export comic PNG/PDF
Local HTTP bridge (127.0.0.1)
  └─ MCP Server (stdio)
       ← Cursor / Doubao / Hermes / 小龙虾 / custom scripts
```

```
Prompt → Your LLM API
              ↓
        ┌─────┴─────┐
        ▼           ▼
   Video shot JS   Comic panel JS
   draw({ t })     still draw
        ↓           ↓
   Timeline        Page compose
        ↓           ↓
   MP4 / WebM      PNG / PDF
```

**Pixel contract:** only model (or local synthesizer) `draw()` paints pixels. Host supplies canvas, clock or page rects, overlays, and record/export.

---

## Node types

### Video

| Type | Role |
|------|------|
| `scene` | Main shot — model paints the world |
| `camera` | Move / zoom / handheld; letterbox + vignette |
| `effect` | Full-bleed rain / glow / particles / … |
| `character` | Attached performer |
| `narration` / `text` | VO / captions |
| `chart` / `image` / `video` / `audio` | Media & data |
| `ai` | Director prompt metadata |

### Anime / page comic

| Type | Role |
|------|------|
| `comic_page` | Page: format, reading path, turn hook, `panelCount` |
| `comic_panel` | Panel frame: order, shape, AI `layout` |
| `comic_shot` | Panel art: `html` / `css` / `js` still |

---

## Quick start

### Requirements

- Windows 10/11  
- [.NET 8](https://dotnet.microsoft.com/) + VS 2022 (“.NET Desktop Development”) or `dotnet` CLI  
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)  
- Access to **your** LLM endpoint (or local Ollama)  
- Node.js 18+ **only** for MCP  

**Not required:** dedicated AI GPU, local T2V weights, vendor-locked video SaaS.

### Build & run

**Visual Studio:** open `MotionCraft.sln` → startup `MotionCraft.Host` → **F5**.

```powershell
dotnet build MotionCraft.sln -c Release
dotnet run --project src/MotionCraft.Host -c Release
```

Optional: open `www/index.html` for frontend-only debugging.

### API setup

**Tools → API / Model Settings** — base URL, model id, API key.

| Goal | Typical baseUrl |
|------|-----------------|
| Doubao / Ark | `https://ark.cn-beijing.volces.com/api/v3` |
| DeepSeek | `https://api.deepseek.com/v1` |
| OpenAI | `https://api.openai.com/v1` |
| Local Ollama | `http://127.0.0.1:11434/v1` |

### Shortcuts

| Key | Action |
|-----|--------|
| Ctrl+N / O / S | New / Open / Save `.vd` |
| Delete | Delete selection |
| Esc | Close preview |
| Space | Video play / pause |
| Space + drag | Pan canvas |

Video duration bar: **1–600 s**.

---

## MCP setup

1. Keep **MotionCraft.exe** running  
2. `cd mcp && npm install`  
3. **Tools → Copy MCP Config** → paste into your MCP host  

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

Use the bridge port written at startup.

### Tools

**Project:** `health` · `get_project` · `set_project` · `list_nodes` · `add_node` · `connect` · `update_props` · `preview`  

**Video:** `run_director` · `run_scene_director` · `run_character_director` · `run_chart_director` · `run_effect_director` · `export_video`  

**Anime / comic:** `run_comic_director` · `run_comic_shot_director` · `export_comic`

---

## How it compares

| | T2V SaaS | T2I + manual comic layout | **MotionCraft** |
|--|----------|---------------------------|-----------------|
| Intermediate | Sealed file | Bitmaps | **Runnable code** |
| Fix one beat | Hard | Redraw | Single-node regen + continuity |
| Panel layout | N/A | Manual | **AI designs count & coords** |
| Hardware | Cloud GPU | Tool-dependent | Normal PC + your API |
| Agents | Rare | Rare | **First-class MCP** |
| Video + comic | Usually separate | Separate | **One studio, two pipelines** |

---

## Documentation

| Doc | Topic |
|-----|--------|
| [`docs/prompts/motioncraft-system-prompt.md`](docs/prompts/motioncraft-system-prompt.md) | Quality constitution (video + comic) |
| [`docs/superpowers/specs/2026-10-08-ai-motion-studio-design.md`](docs/superpowers/specs/2026-10-08-ai-motion-studio-design.md) | Video studio design |
| [`docs/superpowers/specs/2026-10-09-comic-nodes-design.md`](docs/superpowers/specs/2026-10-09-comic-nodes-design.md) | Comic nodes & streaming |
| [`docs/prompts/shot.schema.json`](docs/prompts/shot.schema.json) | Shot JSON schema |
| [`mcp/README.md`](mcp/README.md) | MCP server notes |

---

## License

Private project. Use as needed.
