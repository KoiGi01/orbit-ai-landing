# CLAUDE.md

Guidance for Claude and other coding agents working in this repository.

## Project Overview

Orbit AI is a Spanish-language landing page for an AI automation and voice-agent service. The page sells AI assistants that answer business calls, qualify leads, schedule/follow up through WhatsApp, and capture commercial context for the sales team.

The current implementation is a React + Vite frontend with a small Node HTTP server. The live browser demo uses the Gemini Live API through a browser-first flow: the browser handles microphone permission, audio streaming/playback, transcript state, and demo UI; the backend only protects the real API key and returns short-lived ephemeral tokens.

## Tech Stack

- React 19 with Vite 7
- Plain JavaScript modules, not TypeScript source files
- Custom CSS in `src/styles.css`
- Lucide React for icons
- Fontsource variable fonts
- `@google/genai` for Gemini Live API and auth token creation
- Node built-in `http` server in `server/index.js`

## Key Files

- `src/main.jsx`: Main React app, V2 hero, particle aura canvas, cinematic hero-to-demo transition, demo overlay state, lead form, and landing sections.
- `src/liveDemo.js`: Gemini Live browser session, audio capture/playback, output audio level metering, transcript merging inputs, tool-call handling, demo timeout.
- `src/styles.css`: Global styling, V2 premium dark hero, responsive layout, particle aura/demo transition styles, and remaining landing/demo styles.
- `server/index.js`: API server, `.env` loading, Gemini ephemeral token endpoint, lead logging endpoint, production static serving from `dist`.
- `scripts/dev.js`: Starts both the API server and Vite dev server.
- `vite.config.js`: React plugin and `/api` proxy to `http://127.0.0.1:8787`.
- `README.md`: Product/page summary and basic scripts.
- `DEMO-STEPS.md`: Voice demo architecture plan, safety limits, and QA checklist.

## Commands

Install dependencies:

```bash
npm install
```

Run frontend and backend together:

```bash
npm run dev
```

Run only Vite:

```bash
npm run dev:web
```

Run only the API server:

```bash
npm run dev:server
```

Build:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

Start the Node server, which also serves `dist` when it exists:

```bash
npm start
```

There is no dedicated test script currently. Use `npm run build` as the minimum verification after code changes.

## Environment

Create a local `.env` at the project root:

```txt
GEMINI_API_KEY=your_key_here
```

Optional:

```txt
PORT=8787
HOST=127.0.0.1
GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
```

Never commit `.env`, API keys, or local key files. `.gitignore` already excludes `.env`, `.env.*`, `*.local`, and `api-keys*`.

## Security Rules

- Never place `GEMINI_API_KEY` or any real API key in `src/`, public assets, built frontend code, console output, or screenshots.
- Browser code must request `/api/demo/token` and use only the returned ephemeral token.
- Keep `/api/demo/token` server-side and POST-only.
- Keep lead payloads small and sanitized before logging or storage.
- Do not make the assistant claim a WhatsApp was sent unless a real sending integration confirms it. Current UI prepares a WhatsApp link/message only.
- Preserve the 60-90 second public-demo safety limit unless the product requirement changes.

## Architecture Notes

The browser voice demo flow lives in `src/liveDemo.js`:

1. Request microphone permission after a user gesture.
2. POST to `/api/demo/token`.
3. Connect to Gemini Live with the ephemeral token.
4. Stream microphone audio as PCM.
5. Play assistant audio through `AudioContext`.
6. Emit assistant output levels through `onOutputLevel(level)` so the aura can react to generated speech.
7. Show user/assistant transcripts when the active demo UI requires them.
8. Handle demo tool calls:
   - `capture_lead`
   - `prepare_whatsapp_message`
9. End the session on timeout, user end, close, or API/session error.

The visual demo transition is coordinated in `src/main.jsx`:

- Demo phases include `idle`, `opening`, `handoff`, `active`, and `closing`.
- The hero aura is measured with `getBoundingClientRect()` and a temporary `aura-traveler` animates from the hero position to the demo center.
- During `handoff`, the traveler crossfades out while the demo aura crossfades in.
- The spoken intro starts only after the handoff finishes, so there is no hard cut between the landing and demo.
- The demo intro should feel like a black void with only the aura visible. Scenario options appear only after the spoken intro finishes.

The aura renderer is `AuraScene({ mode, audioLevelRef })` in `src/main.jsx`:

- Current approved direction is a free particle sphere, not a pixel grid, node mesh, blob orb, or wireframe.
- Particles are mostly white/gray with sparse cyan signal accents.
- Particles drift/orbit, magnetically return toward a loose spherical shell, and expand during real assistant speech using output audio levels.
- Hero idle should use the same visual profile as the intro/speaking aura, but without strong audio-driven expansion.
- Keep the wrapper/canvas dimensions stable because the cinematic transition depends on measured bounds.

The Node server in `server/index.js`:

- Loads `.env` manually.
- Creates Gemini auth tokens with one use and short expiry.
- Logs demo leads to the console.
- Serves static files from `dist` in production-style runs.

## UI And Product Direction

- The page is Spanish-first and aimed at businesses in Mexico.
- Current visual direction is V2 premium dark SaaS: luxury, minimal, high-contrast, and technical without becoming cyberpunk.
- The hero should feel like a premium product interface, not generic SaaS and not a HUD/projection-mapping concept.
- Palette: black and off-white dominate. Cyan is scarce and intentional: brand dot, a few particles, subtle signal accents, and limited hover/detail states.
- Avoid purple, lime, heavy glow, dense technical labels, brackets, calibration marks, projection overlays, emoji CTAs, and excessive microcopy.
- Current hero copy:
  - H1: `Asistentes IA con sistema nervioso.`
  - Body: `Agentes de voz, automatizaciones y seguimientos diseñados como infraestructura viva para tu operación.`
  - CTAs: `Demo` and `Sistema`
  - Nav links: `Producto`, `Sistema`, `Contacto`
- Hero layout direction: centered premium composition with nav above, dominant headline, compact glass CTAs, and the particle aura as the brand sculpture below.
- The demo should open into a seamless black void with only the aura visible during the spoken intro. Keep status text, panels, and options hidden until the intro is done.
- Do not turn the demo into open-ended consulting. It should capture name, WhatsApp, and consent for follow-up.
- Be careful with accented Spanish text. Existing files should stay UTF-8.

## Code Style

- Use existing React functional component patterns and hooks.
- Keep logic in plain JS modules unless introducing TypeScript is explicitly requested.
- Prefer small local helpers over broad abstractions.
- Use Lucide icons for UI icons.
- Keep CSS in `src/styles.css` unless a larger refactor is requested.
- Preserve responsive behavior and mobile browser audio constraints.
- Avoid unrelated refactors when making targeted changes.

## Verification Checklist

After frontend or server changes:

```bash
npm run build
```

For live voice demo work, also verify manually in a browser:

- `npm run dev` starts both services.
- Vite serves the app and proxies `/api` to port `8787`.
- Microphone denial shows the fallback lead form.
- Start, mute, unmute, end, retry, and close behave correctly.
- Hero idle uses the same particle-sphere profile as the intro aura.
- Clicking `Demo` has no visible cut after the travel animation.
- During intro, the demo is a black void with only the aura visible.
- Scenario options appear only after the spoken intro ends.
- Speaking expands/reacts to generated voice audio levels, then contracts back.
- Mobile has no horizontal overflow and the aura remains contained.
- API key does not appear in built assets.
- Demo does not claim WhatsApp delivery without a real delivery integration.

Useful screenshot targets from recent V2 work:

- `output/playwright/hero-idle-intro-profile.png`
- `output/playwright/demo-handoff-mid-transition.png`
- `output/playwright/demo-void-intro-seamless.png`
- `output/playwright/demo-void-intro-seamless-mobile.png`
