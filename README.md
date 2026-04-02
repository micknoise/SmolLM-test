# DUNGEON // SmolLM2

A browser-based dungeon crawler powered by **SmolLM2-360M** running entirely client-side via [WebLLM](https://github.com/mlc-ai/web-llm). Rooms, encounters, and outcomes are generated on-device — no server, no API key.

[**Live Demo →**](https://micknoise.github.io/SmolLM-test/)

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│  GitHub Pages (index.html + bundled JS)          │
│                                                  │
│  ┌──────────┐  ┌────────────┐  ┌─────────────┐  │
│  │ WebLLM   │  │ Game       │  │ ASCII       │  │
│  │ Engine   │◄─┤ Engine     │──┤ Renderer    │  │
│  │ SmolLM2  │  │ rooms/     │  │ (box-draw   │  │
│  │ 360M Q4  │  │ encounters │  │  map)       │  │
│  └──────────┘  └─────┬──────┘  └─────────────┘  │
│                      │                           │
│                ┌─────▼──────┐                    │
│                │ Autoplay   │ ← test harness     │
│                │ + Metrics  │                    │
│                └────────────┘                    │
└──────────────────────────────────────────────────┘
```

Model weights load from HuggingFace CDN (~200 MB, cached by browser after first load).

---

## Features

- **Client-side LLM** — SmolLM2-360M-Instruct runs in WebGPU via WebLLM
- **Procedural dungeon** — rooms generate on demand as doors are opened
- **ASCII map** — box-drawing character map shows explored rooms
- **Encounters** — every room has an LLM-generated encounter with 3 choices
- **Mock mode** — `?mock=true` uses template-based generation (no WebGPU needed)
- **Autoplay harness** — bot plays autonomously and reports quality metrics
- **Optimisation loop** — versioned prompt templates in `src/prompts.js`

---

## Setup

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # production build → dist/
```

### Test modes

```bash
# Unit tests (Phase 2 — game engine)
node test/game.test.js

# Integration test (Phase 3 — 10-turn play simulation)
node test/play.test.js

# Full autoplay harness (Phase 4 — N sessions with metrics)
node test/harness.js --runs=10 --maxTurns=30
```

All tests run in mock mode (no WebGPU required in terminal).

---

## Browser Requirements

WebGPU is required for real LLM generation:

- **Chrome 113+** or **Edge 113+** on desktop with a compatible GPU
- **Safari 18+** on macOS/iOS (partial support)
- **Chrome on Android** (some devices)

Fallback: add `?mock=true` to the URL to use template-based generation.

---

## File Structure

```
src/
├── main.js        Entry point
├── llm.js         WebLLM wrapper + mock mode
├── prompts.js     Versioned prompt templates
├── game.js        Game state & data model
├── generator.js   Room/encounter generation via LLM
├── renderer.js    ASCII map renderer
├── ui.js          DOM interaction
├── autoplay.js    Autonomous player bot
└── metrics.js     Metrics collection & aggregation

test/
├── game.test.js   Phase 2 unit tests
├── play.test.js   Phase 3 integration test
└── harness.js     Phase 4 autoplay harness
```

---

## Metrics (mock mode, 10 runs × 30 turns)

| Metric | Value |
|--------|-------|
| Parse fallback rate | 0.0% |
| Coherence score | 0.80 |
| Crash count | 0 |
| Avg rooms generated | 24.2 |
| Survival rate | 100% |

---

## Prompt Tuning

All prompt templates live in `src/prompts.js` as versioned named exports (`ROOM_PROMPT_V1`, `V2`, `V3`). Change the `ROOM_PROMPT` export to switch the active version.

Run `node test/harness.js --runs=10` after each change to compare metrics.
