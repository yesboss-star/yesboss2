# YesBoss Deployment Checklist — Vercel + Render

> Created: 2026-07-03
> Status: In Progress

---

## Phase 1: Git & Security

- [ ] Root `.gitignore` updated with standard entries
- [ ] `backend/.env` contains no committed secrets (already gitignored)
- [ ] `backend/firebase-credentials.json` removed from git history (was committed in past)
- [ ] Auth bypass secured in `backend/app/dependencies/auth.py`
- [ ] All secrets rotated if needed

## Phase 2: Backend — Render

### Pre-reqs
- [ ] `backend/Procfile` created
- [ ] `backend/runtime.txt` created
- [ ] `gunicorn` added to `backend/requirements.txt`
- [ ] Code pushed to GitHub

### Environment Variables (set in Render Dashboard)

| Variable | Value | Notes |
|---|---|---|
| `XAI_API_KEY` | `xai-...` | Primary AI provider |
| `XAI_BASE_URL` | `https://api.x.ai/v1` | |
| `XAI_MODEL` | `grok-4-1-fast` | or whatever model |
| `DEFAULT_AI_PROVIDER` | `xai` | |
| `FIRECRAWL_API_KEY` | `fc-...` | Web scraping |
| `SUPABASE_URL` | `https://oiwbdstrjpchgugavbss.supabase.co` | Auth |
| `SUPABASE_KEY` | `eyJ...` | Service role key |
| `MONGODB_URI` | `mongodb+srv://...` | MongoDB Atlas |
| `QDRANT_URL` | `https://...` | Qdrant cloud |
| `QDRANT_API_KEY` | `eyJ...` | |
| `CORS_ORIGINS` | `https://yesboss-frontend.vercel.app` | Vercel frontend URL |
| `FRONTEND_URL` | `https://yesboss-frontend.vercel.app` | |
| `ZOHO_CLIENT_ID` | `1000.YWTE...` | Zoho OAuth |
| `ZOHO_CLIENT_SECRET` | `...` | |
| `ZOHO_REDIRECT_URI` | `https://yesboss-backend.onrender.com/api/v1/zoho/callback` | **Must update** |
| `SMTP_HOST` | `smtp.zoho.in` | Email |
| `SMTP_USER` | `user2@...` | |
| `SMTP_PASS` | `...` | |
| `VAPID_PUBLIC_KEY` | `BD-QP-...` | Push notifications |
| `VAPID_PRIVATE_KEY` | `F5Mh...` | |
| `FIREBASE_CREDENTIALS_JSON` | Full JSON string | Firebase creds (as env variable) |
| `SENTRY_DSN` | (optional) | Error tracking |

### Deploy Steps
- [ ] Go to [render.com](https://render.com) → New Web Service
- [ ] Connect GitHub repo
- [ ] Root directory: `backend/`
- [ ] Runtime: Python 3
- [ ] Build command: `pip install -r requirements.txt`
- [ ] Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- [ ] Set all env vars from table above
- [ ] Select Free tier
- [ ] Click Deploy
- [ ] Verify: `https://yesboss-backend.onrender.com/api/v1/health`

## Phase 3: Frontend — Vercel

### Pre-reqs
- [ ] `NEXT_PUBLIC_API_URL` updated in frontend config
- [ ] Code pushed to GitHub

### Environment Variables (set in Vercel Dashboard)

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://oiwbdstrjpchgugavbss.supabase.co` | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | |
| `NEXT_PUBLIC_API_URL` | `https://yesboss-backend.onrender.com/api/v1` | Render backend URL |

### Deploy Steps
- [ ] Go to [vercel.com](https://vercel.com) → Add New Project
- [ ] Import GitHub repo (yesboss-star/yesboss2)
- [ ] Root directory: `frontend/`
- [ ] Framework preset: Next.js (auto)
- [ ] Set all env vars from table above
- [ ] Click Deploy
- [ ] Verify: `https://yesboss-frontend.vercel.app`

## Phase 4: Post-Deploy Smoke Tests

- [ ] `GET /api/v1/health` → 200 OK
- [ ] `GET /api/v1/` → API info
- [ ] Auth signup → success
- [ ] Auth login → token returned
- [ ] Create organization → success
- [ ] Dashboard loads with data
- [ ] WebSocket connection established
- [ ] Zoho OAuth redirect works
- [ ] File upload succeeds
- [ ] AI agent responds
- [ ] Goals CRUD works
- [ ] Tasks CRUD works

## Phase 5: Infrastructure

- [ ] MongoDB Atlas whitelist: add `0.0.0.0/0` (temporary for testing)
- [ ] Qdrant: verify API key works from Render IP
- [ ] Zoho OAuth app: update redirect URI
- [ ] UptimeRobot (optional): Set up 5-min ping to prevent Render spin-down

## Known Limitations (Free Tier)

| Issue | Impact | Workaround |
|---|---|---|
| Render spins down after 15 min idle | First request slow (30-60s), scheduler stops | UptimeRobot ping every 5 min |
| WebSocket drops on idle | Real-time updates break after idle | Refresh page to reconnect |
| Ephemeral storage on Render | Uploaded files lost on restart | Use Supabase Storage |
| 512MB RAM on Render | May be tight with heavy AI calls | Monitor usage |

## Next Steps After Testing

- [ ] Move backend to Azure VPS for always-on
- [ ] Fix auth bypass properly (DB validation for X-User-ID)
- [ ] Purge firebase-credentials.json from git history
- [ ] Add CI/CD pipeline
- [ ] Add comprehensive tests
