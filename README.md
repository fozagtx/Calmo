# Calmo

Fix your emotional stress before it ruins your day. Calmo reads your breathing, pulse, HRV and facial expression from your webcam, shows your state (Anxious, Angry, Stressed, Tense, Settling, Calm) on a ring around your face, paces your breath, and coaches you back to calm before exams, interviews and talks.

## Stack

- TanStack Start (React 19, file routes) with TanStack Query, TypeScript in strict mode
- Tailwind CSS v4, Sora and Plus Jakarta Sans
- SmartSpectra Node SDK for on-device vitals
- OpenServ SERV Reasoning for the coach (`/v1/chat/completions`, model `SERV_MODEL`, default `gpt-5.4-mini`)
- Installable PWA (manifest and service worker)

## How the pieces talk

- `src/server/coach.ts`: `getCoachConfig` and `askCoach` are TanStack server functions. The page calls them through TanStack Query (`useQuery`, `useMutation`). The OpenServ key stays on the server.
- `src/server/vitals-socket.ts`: the SmartSpectra SDK is a native Node library, so camera frames stream to it over a WebSocket at `/vitals`. Vite attaches it to its own dev and preview server, so there is no separate server to run.
- Video never leaves your computer. The coach receives only numbers (breathing, pulse, HRV, expression label, state) and what you type.

## Run it

```bash
npm install
cp .env.example .env
# SMARTSPECTRA_API_KEY from https://physiology.presagetech.com
# SERV_API_KEY from https://console.openserv.ai/settings/keys
npm run dev
```

Open http://127.0.0.1:5173. Values in `.env` override the same variables in your shell.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with the vitals socket |
| `npm run build` then `npm run preview` | Production build served with the vitals socket |
| `npm run check` | TypeScript strict type check |

## SmartSpectra tooling

- Agent skill: `.agents/skills/using-smartspectra`
- MCP server: `https://mcp.presagetech.com/mcp`, registered in `.mcp.json`

General wellness feedback only. Calmo is not a medical device.
