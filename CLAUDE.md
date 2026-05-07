# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Autivex AI is a Spanish-language landing page for an AI automation and voice-agent service targeting businesses in Mexico. The page sells AI assistants that answer business calls, qualify leads, schedule/follow up through WhatsApp, and capture commercial context for the sales team.

The implementation is a React + Vite frontend with a small Node HTTP server. The live browser demo uses the Gemini Live API through a browser-first flow: the browser handles microphone permission, audio streaming/playback, transcript state, and demo UI; the backend only protects the real API key and returns short-lived ephemeral tokens.

## Tech Stack

- React 19 with Vite 7
- Plain JavaScript modules, not TypeScript source files
- Custom CSS in `src/styles.css`
- Lucide React for icons
- Fontsource variable fonts (`@fontsource-variable/dm-sans`)
- `@google/genai` for Gemini Live API and ephemeral token creation
- Node built-in `http` server in `server/index.js` (no Express)

## Commands

```bash
npm install          # install dependencies
npm run dev          # run frontend (Vite) + backend (Node) together
npm run dev:web      # Vite only
npm run dev:server   # Node API server only
npm run build        # production build to dist/
npm run preview      # preview production build
npm start            # start Node server (also serves dist/ if it exists)
```

No test script exists. `npm run build` is the minimum verification after any change.

## Environment

Create `.env` at the project root:

```txt
GEMINI_API_KEY=your_key_here
```

Optional:

```txt
PORT=8787
HOST=127.0.0.1
GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
RESEND_API_KEY=your_resend_key        # for lead email notifications
RESEND_FROM=noreply@autivexai.com     # defaults to onboarding@resend.dev
RESEND_TO=contact@autivexai.com       # lead notification recipient
```

## Architecture

### Voice Demo Flow (`src/liveDemo.js`)

This module is the core of the demo. It exports two session factories:

**`createDemoIntroSession`** — plays a one-way spoken intro (no mic). Uses `INTRO_SCRIPT` as the text and `INTRO_PROMPT` as the system instruction. Ends when audio playback finishes.

**`createLiveDemoSession`** — full two-way voice call. Flow:
1. Request mic permission
2. POST `/api/demo/token` → get ephemeral Gemini token
3. Connect to Gemini Live with `speechConfig` (voice: `Leda`) and `enableAffectiveDialog: true`
4. Stream mic audio as PCM at 16 kHz via `ScriptProcessorNode`
5. Play assistant audio through a separate `AudioContext` at 24 kHz
6. Emit output audio levels via `onOutputLevel(level)` for aura animation
7. Emit transcripts via `onTranscript({ role, text })`
8. Handle tool calls: `capture_lead`, `prepare_whatsapp_message`, `request_whatsapp_input`
9. End on timeout (90s), user action, or API error

The session object returned by `createLiveDemoSession` exposes `{ end(), setMuted(bool), submitWhatsapp(number) }`.

**`SCENARIOS`** — exported array of 5 business scenarios (clinic, agency, law, restaurant, realestate). Each has `key`, `label`, `businessRole`, `customerContext`, `firstLine`, `leadSource`.

### Voice Configuration

Both sessions set:
```js
enableAffectiveDialog: true,  // model adapts tone to user's emotional state
speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Leda' } } },
```

`Leda` is the selected voice. To change voices, update the `voiceName` string in both `createDemoIntroSession` and `createLiveDemoSession` configs. Tested alternatives: `Aoede`, `Kore`, `Zephyr`.

### System Prompts

`INTRO_PROMPT` and `buildSystemPrompt(scenario)` in `liveDemo.js` control the agent's personality and call flow. Key principles baked in:
- Formal Mexican Spanish ("usted")
- Professional customer service tone — serene, measured, not enthusiastic
- No filler words ("um", "eh", "claro que sí")
- Does not repeat back what the user said
- Max one short sentence per turn

The demo flow (defined in `buildSystemPrompt`): ask name → greet by name → open scenario → qualify → request WhatsApp via `request_whatsapp_input` tool → capture lead → ask if they want more info → close.

### API Server (`server/index.js`)

Three responsibilities:
- **`POST /api/demo/token`** — creates a single-use Gemini Live ephemeral token with short expiry. The token is constrained to the live model and audio-only mode.
- **`POST /api/demo/lead`** — sanitizes and logs lead data, then calls `sendLeadEmail()` via Resend REST API (non-fatal if `RESEND_API_KEY` is missing).
- **Static serving** — serves `dist/` in production runs.

The server loads `.env` manually without any library.

### Frontend (`src/main.jsx`)

Single-file React app. Key components:
- **`AuraScene({ mode })`** — canvas-based animated orb. Modes map to `auraPalettes` (`idle`, `connecting`, `speaking`, `asking_contact`, `complete`). Uses blob + spark rendering with `requestAnimationFrame`. Do not change canvas dimensions — the cinematic demo transition depends on measured bounds.
- **`LeadForm`** — static contact form used as a fallback when mic is denied or on demo error.
- **`ServiceScrollytelling`** — scroll-driven section with `PhoneMockup`.
- **`App`** — orchestrates demo state, wires `createDemoIntroSession`/`createLiveDemoSession` callbacks, manages `demoPhase` state machine.

The demo `demoPhase` state machine: `idle → intro → scenario_select → live → ended/error`.

### Vite Proxy

`vite.config.js` proxies `/api/*` → `http://127.0.0.1:8787`. The browser never calls the Gemini API directly; it only calls `/api/demo/token` and `/api/demo/lead`.

## Security Rules

- `GEMINI_API_KEY` must never appear in `src/`, built assets, console output, or screenshots.
- Browser code only uses ephemeral tokens returned by `/api/demo/token`.
- `/api/demo/token` is POST-only and server-side only.
- The assistant must not claim a WhatsApp was sent — only that it is "prepared" (`wa.me` link).
- Preserve the 90-second demo timeout (`DEMO_LIMIT_MS`) unless the product requirement changes.

## UI and Product Direction

- Spanish-first, targeting Mexico businesses.
- V2 premium dark SaaS: luxury, minimal, high-contrast. Not cyberpunk.
- Palette: black and off-white dominate. Cyan is scarce — brand dot, a few aura particles, subtle accents only.
- Avoid: purple, lime, heavy glow, dense labels, brackets, projection overlays, emoji CTAs.
- The demo opens into a black void with only the aura visible during the intro. Controls and scenario cards appear only after the intro ends.
- Demo does not become open-ended consulting — it qualifies and captures a lead.
- All source files must stay UTF-8 (accented Spanish characters throughout).

## Code Style

- React functional components and hooks only.
- Plain JS modules — no TypeScript unless explicitly requested.
- CSS lives in `src/styles.css` — no CSS-in-JS, no component-scoped files.
- Lucide React for all icons.
- Prefer small local helpers over abstractions. No premature patterns.
- Avoid unrelated refactors when making targeted changes.
