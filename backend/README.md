# YesBoss Backend
# hi

AI Business Operating System — Backend API (Python FastAPI)

## Setup

```bash
cd backend
python -m venv venv
.\venv\Scripts\activate   # Windows
pip install -r requirements.txt
```

## Environment Variables

Copy `.env.example` to `.env` (or use the existing `.env` at the project root):

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_KEY` | Yes | Supabase service role key |
| `XAI_API_KEY` | No | xAI API key (AI features) |
| `OPENAI_API_KEY` | No | OpenAI API key (fallback) |
| `QDRANT_URL` | No | Qdrant vector DB URL |
| `QDRANT_API_KEY` | No | Qdrant API key |
| `SMTP_HOST` | No | SMTP server for email |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `SENTRY_DSN` | No | Sentry DSN for error monitoring |
| `FIRECRAWL_API_KEY` | No | Firecrawl web scraping |

## Running

### Development (with auto-reload)

```bash
npm run dev
# or
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Production

```bash
npm start
# or
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

API docs: http://localhost:8000/api/docs

## Running the Frontend

From the project root:

```bash
npm run dev      # Next.js dev server on port 3000
```

Or from the `frontend/` directory:

```bash
npm run dev      # Next.js dev server on port 3000
```

## Seeding Test Data

```bash
python backend/seed_test_data.py
```

Creates: test org "Alpha Corp" with 1 owner, 4 employees, 3 goals, 10 tasks, 1 meeting, 1 assistant session.

Idempotent — safe to run multiple times.

## Running Tests

```bash
# All tests
pytest

# With coverage
pytest --cov=app

# Fast tests only (skip slow)
pytest -m "not slow"

# Integration tests
pytest -m integration
```

## Project Structure

```
backend/
├── app/
│   ├── api/            # Route handlers
│   ├── core/           # Config, DB, AI, middleware
│   └── dependencies/   # Auth, etc.
├── tests/              # Test files
├── conftest.py         # Pytest fixtures
├── seed_test_data.py   # Test data seeder
├── setup.cfg           # Pytest config
├── requirements.txt    # Python deps
└── package.json        # npm scripts
```
