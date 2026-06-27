# Cholesterol Tracker

A full-stack app for logging meals, scanning food photos, and tracking dietary
cholesterol against a personalised daily target.

- **Client** (`/`): React + Vite + Tailwind, deployed to Vercel
- **Server** (`server/`): Node.js + Express, deployed to Render
- **Database**: Supabase (PostgreSQL + Auth + Storage)

All AI calls (photo analysis, ingredient lookup, target recommendation) go
through the Express backend, which authenticates the request, checks a
shared ingredient cache, and only calls Anthropic when nothing cached is
found. Common ingredients are pre-seeded into the cache so they never need
an API call at all.

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) account
- An [Anthropic API key](https://console.anthropic.com)
- A [Render](https://render.com) account (for the backend)
- A [Vercel](https://vercel.com) account (for the frontend)

## 1. Set up Supabase

1. Create a new Supabase project.
2. Open **SQL Editor** → **New query**, paste the contents of
   `supabase/schema.sql`, and run it. This creates the `profiles`,
   `blood_tests`, `meals`, `meal_ingredients`, and `ingredient_cache` tables
   with row-level security, plus a public `meal-photos` storage bucket.
3. (Optional) Enable **Google** as an auth provider under
   **Authentication → Providers** if you want Google sign-in to work.
4. Grab these values from **Settings → API**:
   - Project URL
   - `anon` public key (for the client)
   - `service_role` secret key (for the server — keep this private)

## 2. Run the backend locally

```bash
cd server
cp .env.example .env
# fill in ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, CLIENT_URL
npm install
npm run dev
```

The API listens on `http://localhost:3001` by default.

### Pre-load the ingredient cache

To avoid calling Anthropic for common foods, seed the cache once:

```bash
npm run seed:ingredients
```

This inserts ~50 everyday ingredients (eggs, meats, dairy, plant proteins,
oils, etc.) directly into `ingredient_cache`, so `/api/analyse-ingredient`
and `/api/lookup` answer instantly for anything already in the list.

## 3. Run the frontend locally

From the project root:

```bash
cp .env.example .env
# fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
npm install
npm run dev
```

Visit `http://localhost:5173`. You'll see a login/signup screen first —
create an account with email/password (or Google, if configured).

## 4. Deploy the backend to Render

1. Push this repo to GitHub.
2. In Render, create a new **Web Service**, point it at this repo, and set
   the root directory to `server/`.
3. Render will pick up `server/render.yaml` for the build/start commands.
   Set the following environment variables in the Render dashboard
   (marked `sync: false`, so they must be entered manually):
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `CLIENT_URL` — your deployed Vercel URL (used for CORS)
4. Deploy. Note the resulting Render URL (e.g. `https://cholesterol-tracker-api.onrender.com`).

## 5. Deploy the frontend to Vercel

1. In Vercel, import this repo. `vercel.json` at the project root already
   configures the build command, output directory, and framework.
2. Set these environment variables in the Vercel project settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_URL` — your Render backend URL from step 4
3. Deploy.
4. Go back to Render and update `CLIENT_URL` to your live Vercel URL, so
   CORS allows requests from production.

## Environment variables reference

### Root `.env` (client)

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_API_URL` | Base URL of the Express backend |

### `server/.env`

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Server-side Anthropic API key — never exposed to the browser |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key — bypasses RLS, used to read/write the shared ingredient cache and verify user JWTs |
| `CLIENT_URL` | Deployed frontend URL, used for CORS |
| `PORT` | Port the API listens on (defaults to 3001) |

## API routes

All routes under `/api` require a valid Supabase session JWT
(`Authorization: Bearer <access_token>`) and are rate-limited to 20
requests per 15 minutes per IP.

- `POST /api/analyse-photo` — identify a meal from a photo
- `POST /api/analyse-ingredient` — cholesterol breakdown for one ingredient (cache-first)
- `POST /api/lookup` — full nutritional lookup for any food (cache-first)
- `POST /api/recommend-target` — personalised daily cholesterol limit
