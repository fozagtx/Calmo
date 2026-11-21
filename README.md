# Calmo

<img src="public/icons/icon-192.png" alt="Calmo" width="72" align="right">

Fix your emotional stress before it ruins your day. Calmo reads your breathing, pulse and expression through your webcam, shows when you are anxious or tense, and coaches you back to calm before an exam, interview or talk.

## What is it?

Calmo is a TanStack Start web app with four parts:

1. **Camera stage.** A round live camera with a breathing ring around it. The ring grows and shrinks with your chosen breathing guide. Required.
2. **Vitals reader.** The SmartSpectra SDK measures breathing rate, pulse, HRV, facial expression, blinks and face position from the video, on your computer. Required.
3. **State ring.** Calmo combines those readings into a state (Anxious, Angry, Stressed, Tense, Settling, Calm) and colours the ring and face box to match, from red to green. Required.
4. **Coach.** An OpenServ model reads your live numbers, tells you what to do right now, and checks in after the session. Optional. Without `SERV_API_KEY` the session runs and the chat stays off.

You stay in charge. The coach only sees numbers and what you type, never your video.

## How it works

```text
                    YOUR WEBCAM
                         |
                         v
        +----------------------------------+
        |  Browser (React, TanStack Query) |
        |  round camera + breathing ring   |
        +----------------------------------+
             |  RGBA frames over          ^  readings, face box,
             |  WebSocket /vitals         |  validation hints
             v                            |
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
        |  askCoach server function        |
        |  OpenServ /v1/chat/completions   |
        +----------------------------------+
                         |
                         v
          one thing to do now, then a check-in
```

Pulse appears after about 12 seconds, breathing after about 30 and HRV after about 60. A state must hold for 3 seconds before the ring changes, so it does not flicker. If the SDK loses its connection to Presage, Calmo reconnects up to 3 times and keeps your readings.

## Why use it?

- No wearable. A normal webcam in decent light is enough.
- You see your state change, from Anxious to Calm, while you breathe.
- The coach answers with your real numbers, not generic tips.
- Video stays on your computer.
- It installs as an app (PWA).

Results depend on lighting, camera quality, how still you sit and how long you breathe with the guide. Calmo gives general wellness feedback. It is not a medical device.

## Install

```bash
git clone https://github.com/fozagtx/Calmo.git
cd Calmo
npm install
cp .env.example .env
```

Requires Node 22.9 or newer on macOS Apple Silicon, Linux x64/arm64 or Windows x64. `npm install` pulls the SmartSpectra native runtime for every platform, a few hundred MB.

## Quick start

Full setup, with vitals and coach:

```text
SMARTSPECTRA_API_KEY=your_presage_key
SERV_API_KEY=your_openserv_key
```

```bash
npm run dev
```

Open http://127.0.0.1:5173, click **Start a session**, pick Exam, Interview or Speech and a breathing guide, then allow the camera.

Vitals only, coach off: leave `SERV_API_KEY` empty. The session, ring and summary all work, and the chat says the coach is off.

Production build:

```bash
npm run build
npm run preview
```

## Configuration

`.env` in the project root. Values here override the same variables in your shell.

```text
SMARTSPECTRA_API_KEY   required   https://physiology.presagetech.com
SERV_API_KEY           optional   https://console.openserv.ai/settings/keys
SERV_MODEL             optional   defaults to gpt-5.4-mini
```

Never paste keys into chat or commit `.env`. It is in `.gitignore`.

Breathing guides:

- **Steady**: 5 in, 5 out (6 breaths a minute)
- **Long exhale**: 4 in, 6 out
- **Box**: 4 in, 4 hold, 4 out, 4 hold

For a good reading, face a window or lamp, keep your face and upper chest in view, and stay fairly still for the first 30 seconds.

## Useful commands

```text
npm run dev        dev server with the /vitals socket
npm run build      production build
npm run preview    serve the build with the /vitals socket
npm run check      TypeScript strict type check
```

## Important limits

- One session at a time per machine. The SmartSpectra SDK is process-wide, so a second tab is refused.
- The camera needs a secure context. `localhost` and `127.0.0.1` work. Other devices need HTTPS.
- Hiding the tab ends the session, because browsers stop sending camera frames in the background.
- The state ring is an estimate from expression, breathing and pulse. It is not a diagnosis.
- The coach receives breathing, pulse, HRV, expression label, blink rate, state and your message. It never receives video or images.
- The coach gives wellness guidance only. It does not diagnose or treat anything.

## Project layout

```text
src/routes/index.tsx          landing page
src/routes/session.tsx        live session, summary, check-in
src/components/CameraStage    round camera, breathing ring, face box
src/hooks/useVitalsSession    camera, frames, readings, state tracking
src/server/vitals-socket.ts   SmartSpectra SDK over WebSocket /vitals
src/server/coach.ts           getCoachConfig, askCoach (OpenServ)
src/lib/mood.ts               state rules
public/                       manifest, service worker, icons
```

## Development

```bash
npm install
npm run check
npm run dev
```
