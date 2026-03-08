# URIS — Urban Resilience Intelligence System

![URIS Dashboard](dashboard.png)
A dashboard for monitoring urban resilience across Pakistani cities (Karachi, Lahore, Islamabad). View risk by district, run AI-powered analysis, see live signals (jobs, property, news), system alerts, risk trends, and cascading failure simulation.

## Features

- **Multi-city**: Switch between Karachi, Lahore, and Islamabad; districts and data update by city.
- **Risk Map**: Map view with district markers and risk scores; click a district for AI insights.
- **Digital Twin**: Per-district view of infrastructure, mobility, and safety stress with clear metrics.
- **AI Analysis**: Gemini-powered risk analysis (root causes, recommendations); falls back to heuristics if no API key.
- **Live Signals**: City-specific jobs, property, and news (mock data or Bright Data when configured).
- **System Alerts**: City-specific alerts (e.g. flooding, congestion, smog).
- **Risk Trend**: Chart of risk over time per district.
- **Cascading Simulator**: AI or deterministic simulation of system failures.

## Prerequisites

- **Node.js** (v18+)

## Run locally

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment**
   - Copy [.env.example](.env.example) to `.env` or `.env.local` (or `.envlocal`).
   - Set `GEMINI_API_KEY` to your [Google AI Studio](https://aistudio.google.com/apikey) key for AI analysis and simulator. Optional: `GEMINI_MODEL` (default: `gemini-1.5-flash`).
   - Optional: `BRIGHT_DATA_API_KEY` for live jobs/property/news; without it, city-specific mock data is used.

3. **Start the app**
   ```bash
   npm run dev
   ```
   Open **http://localhost:3000** (or the port shown; use `PORT=3001` to change).

## Scripts

| Command       | Description                |
|--------------|----------------------------|
| `npm run dev`   | Start dev server (Express + Vite) |
| `npm run build` | Production build           |
| `npm run preview` | Preview production build |
| `npm run clean`  | Remove `dist/` (Windows-friendly) |
| `npm run lint`   | TypeScript check           |

## Deploying

The app needs the **Express backend** running so `/api/*` routes work. Two options:

**Option A — Single host (recommended)**  
Deploy the full app to a Node host (e.g. [Railway](https://railway.app), [Render](https://render.com), [Fly.io](https://fly.io)):

1. Build: `npm run build`
2. Set env (e.g. `GEMINI_API_KEY`, `PORT`).
3. Start the server: `NODE_ENV=production node server.ts` (or `npx tsx server.ts`). The server serves `dist/` in production, so ensure `dist` exists from step 1.

**Option B — Frontend and backend separately**  
If the frontend is on static hosting (e.g. Vercel, Netlify) and the backend on another URL:

1. Deploy the backend (e.g. Railway) and note its URL (e.g. `https://your-app.railway.app`).
2. In the frontend build, set **`VITE_API_URL`** to that URL (no trailing slash). Example: `VITE_API_URL=https://your-app.railway.app`.
3. Rebuild and deploy the frontend. All API calls will go to `VITE_API_URL`.

If you only deploy the static build (e.g. Vite build) without a backend, API calls will fail and you’ll see errors like “Failed to fetch live signals”.

**Option C — Deploy the whole project on Vercel**  
This repo is set up so the **frontend and API** run on Vercel together (no separate backend):

1. Push the repo to GitHub and [import it in Vercel](https://vercel.com/new).
2. Set **Environment Variables** in the Vercel project (e.g. `GEMINI_API_KEY`, optionally `BRIGHT_DATA_API_KEY`). Do **not** set `VITE_API_URL` — the app uses the same origin for API calls.
3. Deploy. Vercel will run `npm run build` (Vite build → `dist/`), and all `/api/*` requests will be handled by the Express app as a serverless function.

Local preview with Vercel’s routing: `npx vercel dev` (install [Vercel CLI](https://vercel.com/docs/cli) if needed).

## API overview

- `GET /api/health` — Health check
- `GET /api/cities` — List cities
- `GET /api/districts?city=<id>` — Districts for a city
- `GET /api/alerts?city=<id>` — Alerts for a city
- `GET /api/signals/live?city=<id>` — Live signals (jobs, property, news) for a city
- `GET /api/trend/:districtId` — Risk trend for a district
- `POST /api/analysis` — AI/heuristic risk analysis (body: `{ district, signals }`)
- `POST /api/simulate` — Cascading failure simulation (body: `{ district, signals }`)


