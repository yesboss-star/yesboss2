# DeepSeek Migration Plan — Replace Grok (xAI) with DeepSeek + Gemini Embeddings

**Status:** Implemented in code (not yet deployed). Nothing is pushed unless the user explicitly asks.

## Goal

Switch YesBoss's main AI provider from **Grok (xAI)** to **DeepSeek `deepseek-v4-flash`** for all chat/analysis/generation, and use **Gemini** for embeddings (semantic search into Qdrant), because:

- DeepSeek is cheaper/faster for the main AI work.
- **Grok (xAI) does NOT support embeddings** (verified: `POST /api.x.ai/v1/embeddings` → HTTP 403). The app's current embedding step already silently falls back to pseudo-random hash vectors.
- **Gemini supports embeddings natively** (`gemini-embedding-2`), so switching embeddings to Gemini is an upgrade.
- DeepSeek's API does NOT provide embeddings (verified: `POST /api.deepseek.com/embeddings` → HTTP 404).

## Confirmed facts

| Item | Result |
|---|---|
| DeepSeek API key `sk-…` | Valid — returns 200 |
| DeepSeek model availability | `deepseek-v4-flash` and `deepseek-v4-pro` (confirmed via `GET /models`) |
| DeepSeek chat format | OpenAI-compatible (`/chat/completions`) |
| `deepseek-v4-flash` behavior | Reasoning model — returns `reasoning_content` then final `content`; needs adequate `max_tokens` |
| Grok (xAI) embeddings | ❌ 403 — not supported |
| DeepSeek embeddings | ❌ 404 — not supported |
| Gemini embeddings | ✅ Supported — `gemini-embedding-2`, `outputDimensionality=1536` (verified: returns 1536-dim vectors matching existing Qdrant collections) |
| Frontend AI usage | None — all AI goes through the backend default |

## Scope — why "entire project" is one switch

Every AI feature (chat, summaries, goal/task generation, agents, market trends, meeting extraction, report generation, doc Q&A, onboarding chatbot, KPI extraction, etc.) calls through **one abstraction**: `backend/app/core/ai_client.py` (`get_ai_response` / `get_chat_response` / `get_ai_stream_response` / `AIClient`). ~100 call sites pass **no** provider, so they all follow `settings.DEFAULT_AI_PROVIDER`. The frontend has no AI-provider code.

## Implementation (done in code)

### 1. `backend/app/core/ai_client.py` — add `deepseek` provider
- `_get_deepseek_client()` → OpenAI-compatible `AsyncOpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)`.
- `_deepseek_complete()` + `_deepseek_stream()`:
  - Model: `deepseek-v4-flash`.
  - Reasoning-model handling: read `choices[0].message.content`; **fall back to `reasoning_content` if `content` is empty** so we never return a blank answer.
  - Streaming: yield `delta.content` (skip `reasoning_content`).
- Wired `"deepseek"` into `chat_complete` and `chat_complete_stream`.
- xAI code kept intact as a switchable fallback (NOT deleted).

### 2. `backend/app/core/config.py`
- Added:
  - `DEEPSEEK_API_KEY` (from env)
  - `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`)
  - `DEEPSEEK_MODEL` (default `deepseek-v4-flash`)
  - `EMBEDDINGS_PROVIDER` (default `gemini`) — **decoupled** from the chat provider.
- Registered `"deepseek"` in `provider_key_map` validation.
- `DEFAULT_AI_PROVIDER` resolves to `deepseek` when the key is set.

### 3. Embeddings → Gemini
- `backend/app/core/qdrant.py::get_embedding` → `_gemini_embed_sync` (`gemini-embedding-2`, `outputDimensionality=1536`).
- `backend/app/core/file_processor.py::generate_embeddings` → `_gemini_embed_batch` (batchEmbedContents, 1536-dim).
- Fallback order: **Gemini → OpenAI → xAI → deterministic hash fallback** (all independent of `DEFAULT_AI_PROVIDER`).

### 4. Removed hardcoded `provider="xai"`
- `backend/app/api/dashboard.py` (KPI extraction)
- `backend/app/api/goals.py` (goal chat)
- `backend/app/api/market_trends.py` (trends generation)
- `backend/app/api/strategy_chat.py` (strategy chat)
- Explicit `provider="xai"` removed → they now follow `DEFAULT_AI_PROVIDER`.

### 5. Env files
- `backend/.env.example` (tracked): DeepSeek + Gemini embeddings section added.
- Local `backend/.env` and `backend/.env.live` (gitignored): added
  - `DEEPSEEK_API_KEY=sk-…`
  - `DEEPSEEK_BASE_URL=https://api.deepseek.com`
  - `DEEPSEEK_MODEL=deepseek-v4-flash`
  - `DEFAULT_AI_PROVIDER=deepseek`
  - `GEMINI_API_KEY=AQ.…`
  - `EMBEDDINGS_PROVIDER=gemini`
- `deploy/setup-server.sh`: normalizes server `.env.live` for `DEFAULT_AI_PROVIDER=deepseek`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, `EMBEDDINGS_PROVIDER=gemini`, and empty `DEEPSEEK_API_KEY=` / `GEMINI_API_KEY=` placeholders. **API keys are NEVER written into committed files** — the user pastes them once into the server's `backend/.env.live`.

### 6. Verification (performed)
- `ruff check` — clean on all changed files
- `py_compile` — passes
- `pytest` — 20 tests pass
- Live `AIClient(provider="deepseek")` — returns non-empty content (verified against the API)
- Live Gemini embedding call — returns 1536-dim vectors

## What the user must do

- **Server env (one-time):** paste `DEEPSEEK_API_KEY` and `GEMINI_API_KEY` into the server's `backend/.env.live` (the local gitignored copies already have them).
- **Deploy:** push `main` → auto-deploy so the server picks up the new code + env.

## Caveats

- `deepseek-v4-flash` is a reasoning model: answers appear after reasoning; needs adequate `max_tokens` (app already uses 2000–4000). Fallback added so replies are never blank.
- Existing Qdrant vectors were hash/OpenAI-based. New Gemini embeddings improve quality for documents going forward. Optional: re-index already-uploaded documents for best search (not required to work).

## Check-ins / verification options

Use these to confirm the switch after deploy:

- [ ] `GET /api/v1/` and `/api/v1/health` return 200 on live.
- [ ] A live `AIClient(provider="deepseek")` call returns non-empty content from `deepseek-v4-flash`.
- [ ] Chat with the AI on the dashboard → response is DeepSeek-generated (no xAI errors, no blank replies).
- [ ] Create/refine a goal via goal chat → DeepSeek responds with suggestions/strategies.
- [ ] Generate tasks from a strategy → tasks are created.
- [ ] Upload a document → text extraction + Gemini embeddings stored in Qdrant (no zero/fallback vectors).
- [ ] Ask the assistant about an uploaded document → correct RAG answer from Qdrant (Gemini embeddings).
- [ ] Meeting upload → tasks extracted by DeepSeek.
- [ ] Market trends generation → articles/impacts generated by DeepSeek.
- [ ] Reports / weekly summary generation → DeepSeek narrative.
- [ ] Check backend logs: no `Embedding failed`, no provider-missing warnings (`DEFAULT_AI_PROVIDER` = deepseek, `EMBEDDINGS_PROVIDER` = gemini).
- [ ] Confirm xAI/Grok no longer used for chat (only dormant fallback).

## Out of scope (explicitly NOT built)

- No frontend changes.
- No data cleanup / re-indexing of existing documents (optional follow-up).
- No deployment yet — nothing is pushed unless the user explicitly asks.
