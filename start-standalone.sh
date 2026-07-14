#!/bin/bash
set -e

echo "============================================"
echo " YesBoss Standalone — Starting Services"
echo "============================================"

# ── Firebase credentials: write JSON env var to file ──
if [ -n "$FIREBASE_CREDENTIALS_JSON" ]; then
  echo "$FIREBASE_CREDENTIALS_JSON" > /app/firebase-credentials.json
  export FIREBASE_CREDENTIALS_PATH=/app/firebase-credentials.json
  echo "[✓] Firebase credentials written to /app/firebase-credentials.json"
fi

# ── Graceful shutdown handler ──
cleanup() {
  echo ""
  echo "[⏹] Shutting down gracefully..."
  kill "$FRONTEND_PID" "$BACKEND_PID" 2>/dev/null || true
  wait "$FRONTEND_PID" "$BACKEND_PID" 2>/dev/null || true
  echo "[✓] All services stopped."
  exit 0
}
trap cleanup SIGTERM SIGINT

# ── Start Next.js standalone server (background) ──
echo "[→] Starting Next.js frontend on port 3000..."
cd /app/frontend
HOSTNAME=0.0.0.0 PORT=3000 node server.js &
FRONTEND_PID=$!
echo "[✓] Frontend PID: $FRONTEND_PID"

# ── Start FastAPI backend (background) ──
echo "[→] Starting FastAPI backend on port 8000..."
cd /app
uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 2 \
  --timeout-keep-alive 120 \
  --log-level info &
BACKEND_PID=$!
echo "[✓] Backend PID: $BACKEND_PID"

echo ""
echo "============================================"
echo " Frontend → http://0.0.0.0:3000"
echo " Backend  → http://0.0.0.0:8000"
echo " Swagger  → http://0.0.0.0:8000/docs"
echo "============================================"
echo ""

# ── Wait for either process to exit ──
wait -n "$FRONTEND_PID" "$BACKEND_PID" 2>/dev/null
EXIT_CODE=$?
echo "[!] A process exited with code $EXIT_CODE — shutting down all services..."
cleanup
