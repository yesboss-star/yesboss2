# ===================================================
# Standalone Dockerfile (FastAPI + Next.js)
# ===================================================
# Uses external MongoDB Atlas (online) — no local DB needed.
# Pass MONGODB_URI and other env vars at runtime via
# docker run --env-file backend/.env.live ...
# ===================================================

# ── Build stage: compile the Next.js frontend ──
FROM node:20-slim AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./

# Frontend build-time env vars (baked into the JS bundle)
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
ARG NEXT_PUBLIC_RECAPTCHA_SITE_KEY
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1

RUN npm run build

# ── Run stage: Python 3.11 slim + Node from build stage ──
FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive

# Install only the system libs we need (no Node repo needed — we copy from build stage)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        libmagic1 libgl1 poppler-utils && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy Node.js binary from the build stage (avoids NodeSource CDN entirely)
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=build /usr/local/bin/npx  /usr/local/bin/npx

WORKDIR /app

# ── Install Python dependencies ──
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Copy backend source ──
COPY backend/ .

# ── Copy built frontend from build stage ──
RUN mkdir -p /app/frontend
COPY --from=build /app/.next/standalone /app/frontend
COPY --from=build /app/public          /app/frontend/public
COPY --from=build /app/.next/static    /app/frontend/.next/static

# ── Copy startup script ──
COPY start-standalone.sh start-standalone.sh
RUN chmod +x start-standalone.sh

EXPOSE 8000 3000

ENTRYPOINT ["./start-standalone.sh"]
