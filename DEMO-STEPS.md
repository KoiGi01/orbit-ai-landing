# Browser Voice Demo Plan

Goal: replace the current scripted modal with a real browser voice demo for Orbit AI, while keeping the Gemini API key private.

## Architecture Decision

Use a browser-first Gemini Live API flow.

The browser should handle:

- Microphone permission
- Live API WebSocket session
- Audio streaming
- Audio playback
- Transcript and modal state
- Demo action cards

The backend should only handle:

- Reading `GEMINI_API_KEY` from `.env`
- Creating a short-lived Gemini Live ephemeral token
- Returning that token to the browser
- Optional lightweight lead/action logging

This avoids exposing the real API key while keeping latency lower than a backend audio relay.

References:

- Gemini Live API overview: https://ai.google.dev/gemini-api/docs/live-api
- Ephemeral tokens: https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens

## Immediate Security Cleanup

1. Move the key out of `src/api-keys.txt`.
2. Create `.env` at the project root:

```txt
GEMINI_API_KEY=your_key_here
```

3. Add `.gitignore`:

```txt
node_modules
dist
.env
.env.*
src/api-keys.txt
```

4. Do not import, print, commit, or expose the key in browser code.

## Backend V1

Add a tiny Node server.

Suggested files:

```txt
server/index.js
```

Suggested endpoints:

```txt
POST /api/demo/token
POST /api/demo/lead
```

`POST /api/demo/token` should:

- Use `GEMINI_API_KEY` server-side
- Create one Gemini Live ephemeral token
- Restrict it to the chosen Live model and audio response mode if supported
- Return only the ephemeral token to the browser

`POST /api/demo/lead` should:

- Receive name, WhatsApp, transcript summary, and selected action
- Log to console or append to a local file for V1
- Later become CRM, email, Google Sheets, or webhook integration

## Frontend V1

Replace the scripted demo flow in `src/main.jsx`.

Current demo:

- Uses timed fake steps
- Shows transcript text
- Ends with a lead form

New demo:

- Starts only after user clicks the CTA
- Requests microphone permission
- Calls `/api/demo/token`
- Opens a Gemini Live session in the browser
- Streams microphone audio
- Plays assistant audio
- Shows live states and transcript
- Shows action cards when useful

Modal states:

```txt
idle
requesting_mic
connecting
listening
thinking
speaking
muted
ended
error
```

Controls:

- Start demo
- End call
- Mute/unmute
- Retry after error

## Receptionist Prompt

Use a narrow prompt. The demo should qualify and capture a lead, not become an open-ended business consultant.

```txt
Eres Orbit AI, una recepcionista virtual para una demo breve.
Hablas espanol natural, calido y profesional.
Responde como si contestaras una llamada real.
Mantén respuestas cortas: maximo 2 frases.
Pregunta por el tipo de negocio, que necesita automatizar y WhatsApp.
Puedes ofrecer enviar informacion o un enlace para agendar.
No prometas que enviaste WhatsApp si la herramienta no confirmo envio.
No inventes precios exactos.
Si el usuario pregunta por implementacion o precios, ofrece agendar una llamada.
Termina la demo amablemente despues de capturar el WhatsApp o despues de 90 segundos.
```

## Demo Tools

Start with fake-but-useful actions. The UI can show the result, even before real integrations exist.

Tools:

```txt
capture_lead
create_meeting_link
prepare_whatsapp_message
```

V1 behavior:

- `capture_lead`: stores/logs lead data through `/api/demo/lead`
- `create_meeting_link`: returns a static Calendly or booking URL
- `prepare_whatsapp_message`: creates a `wa.me` link with prefilled text

UI action cards:

- Lead captured
- Open WhatsApp message
- Book meeting

Important: the assistant can say "puedo preparar el mensaje" but should not say "ya te lo envie" unless a real sending tool confirms delivery.

## Safety Limits

For a public landing page demo:

- Max call length: 60-90 seconds
- Max turns: 8-10
- End politely after lead capture
- No exact pricing promises
- No legal, medical, financial, or emergency advice
- No open-ended consulting
- Show a fallback lead form if audio fails

## Build Order

1. Secure key with `.env` and `.gitignore`.
2. Add backend token endpoint.
3. Add frontend demo state machine.
4. Request microphone permission.
5. Connect browser to Gemini Live with ephemeral token.
6. Stream mic audio and play assistant audio.
7. Show transcript.
8. Add mute/end/retry controls.
9. Add fake tools and action cards.
10. Add lead logging endpoint.
11. Add 60-90 second timeout.
12. Test desktop Chrome.
13. Test mobile Chrome and Safari.
14. Deploy with environment variables and HTTPS.

## QA Checklist

- Key never appears in built frontend assets.
- `src/api-keys.txt` is ignored or removed.
- Mic permission denied shows a graceful fallback.
- Start, mute, unmute, end, and retry work.
- User can interrupt while the assistant is speaking.
- Assistant asks for business type and WhatsApp.
- Assistant does not claim to send WhatsApp messages.
- Call ends after the configured limit.
- Mobile browser audio starts only after a user gesture.
- The existing landing page remains visually intact.

## Later Improvements

- Store leads in Google Sheets, Airtable, HubSpot, or a webhook.
- Add real booking integration.
- Add real WhatsApp sending through an approved provider.
- Add rate limiting to `/api/demo/token`.
- Add abuse monitoring and per-IP call limits.
- Add a text fallback demo for users without microphone access.
