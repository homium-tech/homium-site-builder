# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm** (not npm — the system prompt sent to the AI engines explicitly mandates `pnpm`).

```bash
pnpm start              # Run the Express server (node server.js) — http://localhost:8080 (or $PORT)
pnpm run dev             # Same as start, no watch mode
pnpm run setup           # Interactive install/diagnostic wizard (scripts/setup.cjs)
pnpm run doctor          # Same wizard, check-only (no installs) — scripts/setup.cjs --check-only
pnpm run install:playwright  # Optional: installs Chromium for forensic URL extraction
pnpm test                # Runs every test file under test/ sequentially (see below)
```

There is no test framework — each file under `test/` is a standalone Node script using `assert` with a hand-rolled runner, and prints its own pass summary. Run one file directly to isolate it:

```bash
node test/agent-engine.test.js
node test/deliverable-store.test.js
node test/multi-engine.test.js
node test/workspace.test.js
node test/pipeline.test.js
node test/cli-spawn.test.js           # CLI executable resolution without a shell
node test/message-heuristics.test.js  # question/request/brand-name classification
node test/off-topic-flow.test.js      # deviation rule, pending step, lastAction
node test/format-text.test.js         # formatText sanitization (extracted from public/app.js)
node test/persistence.test.js         # chat/state persistence across reloads
node test/engine-reliability.test.js  # stream parsing, single done/error, failed/cancelled turns, timeout, HTTP adapters
node test/history-durability.test.js  # atomic chat_history.json, corrupt-file quarantine, 500-message cap, session eviction
node test/server-chat.test.js         # boots the real server with the mock engine: /api/chat, 409, disconnect, cancel, reset
```

Tests that touch disk use a `scratch_test_*` dir under `test/` and clean it up themselves.

No lint/typecheck script is configured.

## Required environment (.env)

The server refuses to authenticate without `AUTH_PASS`. Copy `.env.example` → `.env`:

- `AUTH_USER`, `AUTH_PASS` — login credentials (compared with `crypto.timingSafeEqual`)
- `SESSION_SECRET` — session signing secret (random if unset, meaning sessions reset every restart)
- `PORT` (default `8080` — same as the default llama.cpp port, so set one of `PORT` / `LLAMACPP_HOST` if you run both; `README.md` still says `3000`, which is stale), `HOST` (default `0.0.0.0`)
- `ALLOWED_ORIGINS` — comma-separated extra origins allowed through CORS/`requireSameOrigin` (e.g. `http://apps.homium.tech:8080`). Required if the app is exposed under any domain other than `localhost`/`127.0.0.1`/`::1` — otherwise every `/api/*` call (chat, tabs, SSE) is silently blocked while `/login` still loads fine
- `WORKSPACE_DIR` / `WORKSPACE_ROOT_DIR` — where generated projects live (default `~/Downloads/homium_projects`, **outside the repo**)
- `LLAMACPP_HOST`, `OLLAMA_HOST`, `OLLAMA_MODEL` — for the local server-based engines

## Architecture

This is a chat-driven, multi-engine AI orchestrator that drives a **fixed 5-phase design pipeline** (Discovery → Foundations → Components → Validation → Prototype) to autonomously produce a Homium-branded design system and a 3-page vanilla HTML/CSS/JS prototype. The Express server (`server.js`) is mostly plumbing; the actual "intelligence" is a system prompt sent to whichever CLI/API engine is selected, and the server's job is to supervise disk output and relay the conversation.

### Request flow

`server.js` → `AgentEngine.executeTurn()` (`lib/agent-engine/index.js`) → engine-specific **adapter** (`lib/agent-engine/adapters/*.js`) spawns a child process or makes an HTTP call → stdout is parsed by `StreamParser` into `text_delta`/`tool_activity`/`log` chunks → wrapped in a `TurnStream` (EventEmitter + async-iterable) → `TurnStream.pipeToSSE()` streams `chunk`/`metrics`/`done`/`error` SSE events straight to the browser at `POST /api/chat`.

- **Adapters** (`lib/agent-engine/adapters/`) implement the `EngineAdapter` seam (`buildCommandAndArgs`, `spawnTurn`) for 7 engines: `claude`, `agy` (Antigravity), `codex`, `opencode`, `llamacpp`, `ollama`, `mock`. The mock adapter simulates responses in-memory for testing with no external calls. Adding a new engine means adding one adapter file and registering it in `AgentEngine`'s constructor.
- **Prompt construction** (`AgentEngine.executeTurn`) is stateful per-session per-engine: the *first* turn for a given engine injects the full canonical activation prompt (`core/prompts/system-rules.js` → `buildActivationPrompt`, workspace-scoped); *subsequent* turns instead inject a compact directive plus a hybrid context block: the raw JSON of `design-system-state.json` from disk (if present) and the last conversational exchange from `SessionStore`. This keeps token usage low without an LLM ever seeing the full history.
- **`core/prompts/system-rules.js`** is the actual canonical spec the AI must follow: single-question-rule, strict phase ordering, mandatory numbered options with a "custom" option always last, WCAG 2.2 AAA color constraints, "no emojis in UI," "no brackets in labels," pnpm-only, and the hard rule that the pipeline **must terminate at Phase 5** (never invent a Phase 6 / scaffolding / frameworks). Treat this file as the product spec, not incidental config.
- **`core/pipeline/index.js`** (`Pipeline` class) is the *server-side*, source-of-truth mirror of that same 5-phase structure (`CANONICAL_PHASES`) plus a regex-based `detectAction()` that scans the agent's streamed text for phase-transition/gate language and returns a sanitized (non-regex) UI descriptor — chips, cards, or approval gates — consumed by the frontend to render interactive controls instead of free text. `PhaseRegistry`/`PhaseDescriptors` are backward-compat aliases around the same class. There is no advanced/expanded phase set anymore (`ADVANCED_EXPANSION_PHASES` is empty and `enableAdvancedPhases()` is now a no-op that always re-pins to the 5 canonical phases) — don't build features assuming otherwise.
- **`lib/workspace/index.js`** (`Workspace`) owns the on-disk sandbox: resolves the base dir (`WORKSPACE_DIR`/`WORKSPACE_ROOT_DIR` or `~/Downloads/homium_projects`), derives a per-project subfolder slug from the user's first message (`extractProjectName`, Spanish-language heuristics + URL parsing), persists the active project via a `.active_project` marker file, and emits `projectChanged` so `server.js` can re-point `AgentEngine` and `DeliverableStore` at the new directory live. All generated deliverables must stay confined under this dir — never in repo-relative paths or hidden CLI config dirs.
- **`lib/deliverable-store/index.js`** (`DeliverableStore`) watches the workspace directory on disk (debounced) and exposes an O(1) in-memory snapshot plus an SSE channel (`GET /api/deliverables/stream`) so the frontend reacts to file changes (state JSON, showcase HTML, prototype files) with zero polling.

- **Live preview follow**: the snapshot's `status` carries `showcaseVersion` / `prototypeVersion` (mtime+size signatures), so `DeliverableStore` emits `change` when an existing HTML is rewritten, and the client reloads the matching iframe (`?v=` cache-buster). `app.js` `followLiveTab()` switches tabs by `current_phase` (1-3 Blueprint, 4 Showcase, 5 Prototype; deliverables that already exist can only move it forward); a manual tab click pauses it until the target changes, and the "En vivo" button toggles it (`localStorage` key `homium_follow_live`). `renderBlueprint()` wraps `renderBlueprintRaw()` to flash whatever changed between renders.
- **Off-topic / deviation handling**: nothing server-side classifies or blocks a message; the agent is steered by prompt. `DEVIATION_RULE` (directive 17, also in the compact per-turn directive together with `STAGE_MAP`) tells the agent to answer briefly or refuse, then `---` and repeat the pending question. The pending question survives because `AgentEngine` keeps `session.pendingStep` (last agent reply containing an `Etapa N`/`Fase N` title) and the server also passes `workspace.getPendingStep()` from `chat_history.json`, so it is re-injected even after the deviation reply itself. Claude engine turns are stateless (`claude -p`, no `--session-id`), so this block is the only memory of the position. `core/text/message-heuristics.js` is a UMD module shared by Node (`Workspace.extractProjectName`, `Pipeline.detectAction`) and the browser (served at `/message-heuristics.js`, used by `inspectUserMessageForState`): questions/requests/greetings never become a project or brand name, and when the user message is a request `detectAction` only looks at the part after the last `---` and only if it is a flow step. `lastAction` in the history is kept through deviations and cleared when the flow advances to a step without controls; the client restores the pending gate after a deviation.
- **Spawning CLI engines**: adapters never use `shell: true`. `lib/agent-engine/adapters/cli-spawn.js` resolves the real executable (env override `CLAUDE_BIN`/`AGY_BIN`/`CODEX_BIN`/`OPENCODE_BIN`, known paths, then PATH; npm `.cmd` shims are unwrapped to the `.exe`/JS they launch) so the prompt reaches the child intact. On Windows, `shell: true` splits the prompt on spaces and cmd.exe interprets `& | > %` in it. If you add an adapter, use `resolveInvocation` too.
- **`formatText` (public/app.js)** renders agent output as HTML: text is escaped including quotes, links are limited to `http(s)` or site-absolute paths, file-link paths are re-escaped after `decodeURIComponent`. The chat chip/card tray (`#dynamicActionTray`) is deliberately hidden by CSS (`display: none !important`, commit b761803); the visible interactive control is the approval gate.
- **Reload/persistence**: `GET /api/chat/history` rebuilds the UI after F5 from `workspace.getChatHistory()` (messages + last pending action) plus `deliverableStore` state; if no action was stored it infers the approval gate from which deliverables exist. The client also keeps `homium_site_builder_session_id`, the preferred engine, and a cached resumed-project payload in `localStorage`. `POST /api/reset` wipes session, project and state.

### Frontend

Single-page app served from `public/`: `index.html` + `app.js` (client SSE consumption, chat UI, telemetry panel) + `styles.css`. `public/homium/` holds the packaged Homium Design System tokens/fonts/logos used both by the app UI and by every generated deliverable preview. `login.html` is a separate unauthenticated route.

Preview routes (`server.js`) render generated deliverables directly from the workspace with a standardized "waiting" placeholder page when a phase hasn't produced its artifact yet:
- `/preview/prototype` — Phase 5 output (`prototype/index.html`)
- `/preview/showcase` — Phase 4 output (`*_Design_System.html` in the workspace root)
- `/preview/blueprint` — Phase 1 architectural blueprint, driven by `deliverableStore` state

### Security posture (already implemented, follow the same patterns)

Session-cookie auth (`express-session`, `httpOnly`, `sameSite: strict`) gates everything except `/login` and `/api/auth/login`. Login uses `crypto.timingSafeEqual` for constant-time comparison and a per-IP rate limiter (10 attempts / 15 min). CORS and a `requireSameOrigin` middleware restrict `/api/*` to same-origin/localhost. `/preview/*` gets its own CSP with a sandboxed iframe policy since it renders AI-generated HTML.

### Reference/knowledge base (not code, but shapes what the engines generate)

- `references/phases/phase-{1..5}-*.md` — detailed per-phase specs mirroring `core/prompts/system-rules.js`
- `references/component-catalog.md`, `token-architecture.md`, `brand-equalizer.md`, `accessibility-checklist.md`, `interactive-states.md` — design-system knowledge base the AI draws on
- `templates/design-system.html` / `.md` — the mandatory structural base for the Phase 4 showcase (must keep all 15 canonical sections + Left Rail Sidebar; the system prompt explicitly forbids generating a simplified showcase from scratch)
- `scripts/compile_showcase.cjs`, `scripts/verify_fidelity.cjs`, `scripts/extract_reference_dna.cjs`, `scripts/audit_showcase.cjs` — CJS scripts the AI engines are instructed to invoke directly (via `node scripts/...`) during phases 1/4, not app code invoked by the server itself

### Language and repo quirks

- Code comments, server logs, and most user-facing strings are in Spanish; match that in surrounding code.
- `README.md` and `TRANSICION_Y_ROADMAP.md` are partly aspirational/stale (e.g. README mentions phases 5–11, port 3000, "33 tests"; the roadmap proposes SQLite + Astro/TypeScript, which is not implemented). Trust this file and the code over them.
- `.agents/`, `.claude/` and `skills-lock.json` are git-ignored local skill installs, not part of the app.

### Distribution

`install.sh` / `homium-site-builder.sh` implement a separate global-CLI install path (`homium-site-builder start|stop|status|open|--update`) unrelated to running the repo directly with `pnpm start`; see `commands/homium-site-builder.md` for the Claude Code slash-command wrapper around it.
