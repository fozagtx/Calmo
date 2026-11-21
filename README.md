# Calmo

<img src="build/icon.png" alt="Calmo" width="72" align="right">

Fix your emotional stress before it ruins your day. Calmo reads your breathing, pulse and expression through your webcam, shows when you are anxious or tense, and coaches you back to calm before an exam, interview or talk.

Calmo runs two ways from one codebase: a **Mac app** and a **local web app**.

## What is it?

Calmo has five parts:

1. **Onboarding.** Three animated screens on first launch of the Mac app: what uncontrolled stress costs you, how Calmo reads you, and how you breathe back to calm.
2. **Camera stage.** A round live camera with a breathing ring around it. The ring grows and shrinks with your breathing guide. Required.
3. **Vitals reader.** The SmartSpectra SDK measures breathing rate, pulse, HRV, facial expression, blinks and face position from the video on your computer. Required.
4. **State ring.** Calmo combines those readings into a state (Anxious, Angry, Stressed, Tense, Settling, Calm) and colours the ring and face box to match, from red to green. Required.
5. **Coach.** An OpenServ model reads your live numbers, tells you what to do right now, and checks in after the session. Optional. You pick the model from a dropdown in Settings.

You stay in charge. The coach only sees numbers and what you type, never your video.

## How it works

```text
                       YOUR WEBCAM
                            |
          +-----------------+-----------------+
          |                                   |
     MAC APP (Electron)                LOCAL WEB APP (browser)
     SDK renderer + IPC               frames over localhost
     in the same app                  WebSocket /vitals
          |                                   |
          +-----------------+-----------------+
                            v
          +----------------------------------+
          |  SmartSpectra SDK (Node, native) |
          |  breathing, pulse, HRV, face     |
          +----------------------------------+
                            |
                            v
          +----------------------------------+
          |  State ring                      |
          |  Anxious -> Tense -> Settling    |
          |  -> Calm  (holds 3s to switch)   |
          +----------------------------------+
                            |
            you type  ------+------  session ends
                            v
          +----------------------------------+
          |  Coach (TanStack Query mutation) |
          |  OpenServ /v1/chat/completions   |
          +----------------------------------+
                            |
                            v
             one thing to do now, then a check-in
```

Pulse appears after about 12 seconds, breathing after about 30 and HRV after about 60. A state must hold for 3 seconds before the ring changes, so it does not flicker. If the SDK loses its connection to Presage, Calmo reconnects up to 3 times and keeps your readings.

## Why use it?

- No wearable. A normal webcam in decent light is enough.
- You watch your state change from Anxious to Calm while you breathe.
- The coach answers with your real numbers, not generic tips.
- Video stays on your computer. SDK telemetry is turned off.

Results depend on lighting, camera quality, how still you sit and how long you breathe with the guide. Calmo gives general wellness feedback. It is not a medical device.

## Install

```bash
git clone https://github.com/fozagtx/Calmo.git
cd Calmo
npm install
node node_modules/electron/install.js
```

Requires Node 22.9 or newer. The Mac app needs an Apple Silicon Mac. The SmartSpectra runtime supports macOS arm64, Linux x64/arm64 and Windows x64. `npm install` pulls the runtime for every platform, a few hundred MB.

## Quick start

### Mac app

Download `Calmo-0.1.0-arm64.dmg` from [Releases](https://github.com/fozagtx/Calmo/releases), or build it yourself:

```bash
npm run build:mac
open release/Calmo-0.1.0-arm64.dmg
```

Drag Calmo into Applications. The build is not notarized yet, so the first time, right-click Calmo and choose Open. Then:

1. Go through the three welcome screens.
2. Open **Settings**, paste your SmartSpectra key (and an OpenServ key for the coach), and pick a coach model.
3. Click **Start session** and allow the camera when macOS asks.

Run the Mac app from source with live reload:

```bash
npm run dev:mac
```

In this mode the app also reads keys from `.env`.

### Web app (local)

```bash
cp .env.example .env
npm run dev
```

Open http://127.0.0.1:5173, click **Start a session**, pick Exam, Interview or Speech and a breathing guide, then allow the camera.

Vitals only: leave `SERV_API_KEY` empty. The session, ring and summary all work, and the chat says the coach is off.

## Configuration

| Setting | Mac app | Web app |
| --- | --- | --- |
| SmartSpectra key (required) | Settings, encrypted with your login keychain | `SMARTSPECTRA_API_KEY` in `.env` |
| OpenServ key (optional) | Settings, encrypted with your login keychain | `SERV_API_KEY` in `.env` |
| Coach model | Settings dropdown | Settings dropdown (saved in the browser) or `SERV_MODEL` |

Get keys at https://physiology.presagetech.com and https://console.openserv.ai/settings/keys. The model dropdown lists the models on your OpenServ account and needs a valid key to load. Never paste keys into chat or commit `.env`.

Breathing guides:

- **Steady**: 5 in, 5 out (6 breaths a minute)
- **Long exhale**: 4 in, 6 out
- **Box**: 4 in, 4 hold, 4 out, 4 hold

For a good reading, face a window or lamp, keep your face and upper chest in view, and stay fairly still for the first 30 seconds.

## Useful commands

```text
npm run dev          web app with the /vitals relay and /api routes
npm run dev:mac      Mac app from source against the Vite dev server
npm run build:mac    build release/Calmo-0.1.0-arm64.dmg
npm run build:web    static web bundle in dist/
npm run preview      serve the web bundle with the relay
npm run check        TypeScript strict type check
```

## Important limits

- One session at a time per machine. The SmartSpectra SDK is process-wide.
- The web app is for local use. It streams raw frames over localhost, which does not work over the internet, and the camera needs `localhost` or HTTPS.
- The Mac build is ad-hoc signed, not notarized. macOS asks you to confirm the first open. Public distribution needs an Apple Developer ID.
- The state ring is an estimate from expression, breathing and pulse. It is not a diagnosis.
- The coach receives breathing, pulse, HRV, expression label, blink rate, state and your message. It never receives video or images.

## Project layout

```text
electron/main.ts              window, camera permission, keys, coach IPC
electron/preload.ts           SmartSpectra bridge plus window.calmo
electron/keys.ts              keychain-encrypted key storage
server/web-plugin.ts          /api/config, /api/models, /api/coach for the web app
server/vitals-relay.ts        Node SDK behind WebSocket /vitals for the web app
server/coach.ts               OpenServ calls, shared by Mac and web
src/routes/welcome.tsx        onboarding (three screens)
src/routes/session.tsx        live session, summary, check-in
src/routes/settings.tsx       keys and model dropdown
src/hooks/useVitalsSession    session state, mood tracking, reconnects
src/lib/vitals-source.ts      Mac SDK or web relay behind one interface
src/components/CameraStage    round camera, breathing ring, face box
```

## Development

```bash
npm install
npm run check
npm run dev
```
