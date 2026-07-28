# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This is a monorepo with two independently deployable apps built into a single Docker image:

- `backend/` — FastAPI (Python 3.11), all business logic and data access
- `frontend/` — Next.js 16 (App Router), React 19, TypeScript

They are deployed together as one container (see `Dockerfile` / `docker-compose.yml`): the frontend is built to a standalone Next.js output and both processes run in the same image, started by `start-standalone.sh`. There is no shared root `package.json` — always `cd` into `frontend/` or `backend/` before running npm/pytest commands.

## Commands

### Frontend (`frontend/`)
```bash
npm run dev              # Next.js dev server, port 3000
npm run build             # production build
npx tsc --noEmit           # type-check (no dedicated `typecheck` script)
npm run lint               # eslint
```

### Backend (`backend/`)
```bash
python -m venv venv && .\venv\Scripts\activate   # Windows
pip install -r requirements.txt

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload   # dev server (or `npm run dev`)
uvicorn app.main:app --host 0.0.0.0 --port 8000             # prod (or `npm start`)

pytest                          # all tests
pytest --cov=app                # with coverage
pytest -m "not slow"            # skip slow tests
pytest -m integration           # integration tests only
pytest tests/test_frequency_agent.py::test_name   # single test

ruff check app/                 # lint
mypy app/                       # type check
python seed_test_data.py        # seed a test org ("Alpha Corp") with owner/employees/goals/tasks
```
Test config lives in `pyproject.toml` / `setup.cfg` (`testpaths = tests`, `asyncio_mode = auto`). Backend CI runs ruff and mypy with `continue-on-error: true`, so they don't currently block merges — don't assume clean output means the check is enforced.

Env vars load from `backend/.env` (or `backend/.env.live` when `ENVIRONMENT=production`) via `app/core/config.py`. Copy `backend/.env.example` to get started.

## Architecture

### Request flow and auth
Auth is Firebase, not a custom JWT system. The frontend uses the Firebase client SDK (`frontend/src/lib/firebase.ts`) to sign the user in, then POSTs the Firebase ID token to `POST /api/v1/auth/set-session`, which the backend turns into an httpOnly `yesboss_token` cookie. Every subsequent backend request is authenticated by `app/dependencies/auth.py::get_current_user`, which reads the bearer token or the `yesboss_token` cookie and verifies it with `firebase_admin` (`app/core/firebase_admin.py`). Roles (`owner` / `employee`) come from Firebase custom claims and are enforced with `require_role(...)`.

Route protection on the frontend (`frontend/src/proxy.ts`) is cookie-presence based only (checks `yesboss_token`/`yesboss_user` cookies), not a real token verification — it just decides whether to redirect to `/login` or `/dashboard`.

**Next.js 16 naming note:** this Next.js version renamed `middleware.ts` to `proxy.ts` (see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). Don't reintroduce a `middleware.ts` file expecting old-Next.js behavior — `frontend/src/proxy.ts` with the `matcher` config in its `export const config` is the real one. `frontend/AGENTS.md` flags generally that this Next version has breaking changes vs. training data and to check `node_modules/next/dist/docs/` before relying on prior Next.js knowledge.

### Backend structure (`backend/app/`)
- `api/` — one router module per domain (goals, tasks, employees, meetings, notifications, zoho_*, etc.), all mounted under `/api/v1/...` in `main.py`. When adding an endpoint, add/extend a router here and wire it in `main.py`'s router list — routers aren't auto-discovered.
- `core/` — cross-cutting infra: `config.py` (plain `Settings` class reading `os.getenv` directly — not pydantic-settings validated despite being a dependency), `database.py` (MongoDB via **synchronous** `pymongo`, called from async routes — not motor), `qdrant.py` (vector store for `documents`/`conversations`/`workflows` collections), `ai_client.py` (thin multi-provider LLM wrapper — xAI/Grok is the default provider, with OpenAI/Anthropic/Gemini/local-Ollama-Qwen as alternates selected via `DEFAULT_AI_PROVIDER`), `firebase_admin.py`, `scheduler.py` (background loop started in `main.py`'s lifespan), `zoho/` (Zoho Mail/Calendar integration).
- `agents/` — LangGraph/LangChain stateful agents (e.g. `master_agent.py` is a `StateGraph`-based onboarding/company-profile agent). This is a distinct layer from `core/ai_client.py`'s stateless completion calls.
- `dependencies/` — FastAPI `Depends` providers (auth, pagination).
- Supabase is configured (`core/supabase_client.py`, connected at startup) but barely used server-side today — it's mostly a frontend-direct integration (`frontend/src/lib/supabase*.ts`), not the backend's primary datastore. **MongoDB is the source of truth**; don't assume Supabase tables mirror Mongo collections.
- `/api/docs`, `/api/redoc`, and `/api/openapi.json` are gated behind `X-Admin-Key` (or `?admin_key=`) matching `ADMIN_API_KEY`, and disabled outright in production (`_require_admin` in `main.py`) — the default `docs_url=None` FastAPI config is intentional, not an oversight.
- MongoDB collections and their indexes are declared centrally in `core/database.py` (`_ensure_collections` / `_ensure_indexes`) and created idempotently at startup — if you add a new collection that needs indexes, add it there rather than creating indexes ad hoc in route handlers.

### Frontend structure (`frontend/src/`)
- `stores/` — one Zustand store per domain (`goalStore`, `taskStore`, `organizationStore`, etc.), re-exported from `stores/index.ts`. Stores call the backend directly (`fetch` against `NEXT_PUBLIC_API_URL`, auth via `getAuthHeaders()` in `lib/utils.ts`, which reads a token from `localStorage`) — there is no shared API-client abstraction, so each store implements its own fetch/error handling. Some stores use `persist` to localStorage (e.g. goals — see the debugging checklist below).
- `components/owners/` — owner-role dashboard views/widgets; plain `components/` holds shared/marketing components; `components/ui/` is the design-system primitives layer (Radix-based).
- `contexts/AuthContext.tsx` — wraps Firebase `onAuthStateChanged`, establishes/clears the backend session cookie, and is the source of `user`/`role` for the app (guards against redundant re-auth on token refresh via a `lastUidRef` check).
- App Router routes live in `app/`; `dashboard/`, `onboarding/`, `goals/`, `tasks/` are the main authenticated sections.

### Debugging checklist (goals not showing on dashboard)
(from `frontend/AGENTS.md` — a recurring real issue, not hypothetical)
1. Rebuild + redeploy frontend after pulling code
2. Check browser console for `[goalStore]` / `[GoalSection]` log lines
3. Check Network tab → `GET /api/v1/goals?organization_id=...&limit=20` status/body
4. Clear localStorage key `yesboss-goals`, or test in incognito
5. Restart backend to pick up latest changes

## Deployment
`.github/workflows/deploy.yml` deploys on push to `main` via SSH: `git reset --hard HEAD && git pull`, then `docker compose build --no-cache && docker compose up -d` on the VPS. `docker-compose.yml` builds a single `yesboss-app` container exposing both 3000 (frontend) and 8000 (backend). Frontend CI (`frontend-ci.yml`) and backend CI (`backend-ci.yml`) run on path-scoped triggers (`frontend/**`, `backend/**` respectively) — lint/typecheck steps are `continue-on-error`, only the build/test steps actually gate.
