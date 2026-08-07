#!/bin/bash
# =============================================================
# YesBoss one-time + idempotent server setup for vsllp.live
# Installs nginx + certbot, configures the reverse proxy, and
# issues the Let's Encrypt SSL certificate.
# Safe to re-run on every deploy — it skips what already exists.
# =============================================================
set -e

DOMAIN="vsllp.live"
WWW_DOMAIN="www.vsllp.live"
SSL_EMAIL="yesbossvsllp1@gmail.com"

# The deploy workflow runs this from the repo checkout (~/yesboss2)
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NGINX_SRC="$REPO_DIR/deploy/nginx/yesboss.conf"
NGINX_CONF="/etc/nginx/sites-available/yesboss.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/yesboss.conf"

echo "=== Setting up server for $DOMAIN ==="

# --- 1. Install nginx + certbot (no-op if already installed) ---
if ! command -v nginx >/dev/null 2>&1; then
  echo "[1/6] Installing nginx..."
  sudo apt-get update -y
  sudo apt-get install -y nginx
else
  echo "[1/6] nginx already installed."
fi

if ! command -v certbot >/dev/null 2>&1; then
  echo "[1b/6] Installing certbot..."
  sudo apt-get install -y certbot python3-certbot-nginx
else
  echo "[1b/6] certbot already installed."
fi

# --- 2. Install the nginx site config ---
echo "[2/6] Installing nginx site config..."
sudo cp "$NGINX_SRC" "$NGINX_CONF"

# Enable our site and disable the default one
sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
sudo ln -sf "$NGINX_CONF" "$NGINX_ENABLED"
sudo rm -f /etc/nginx/sites-enabled/default

# --- 3. Validate + reload nginx ---
echo "[3/6] Validating and reloading nginx..."
sudo nginx -t
sudo systemctl enable nginx 2>/dev/null || true
sudo systemctl reload nginx 2>/dev/null || sudo systemctl restart nginx

# --- 4. Open ports 80/443 in any OS firewall that is active ---
echo "[4/6] Ensuring ports 80/443 are open..."
if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
fi
if command -v firewall-cmd >/dev/null 2>&1 && sudo firewall-cmd --state >/dev/null 2>&1; then
  sudo firewall-cmd --permanent --add-service=http
  sudo firewall-cmd --permanent --add-service=https
  sudo firewall-cmd --reload
fi

# --- 5. Issue / renew SSL certificate (idempotent) ---
echo "[5/6] Ensuring SSL certificate + nginx HTTPS block..."
if sudo test -d "/etc/letsencrypt/live/$DOMAIN"; then
  echo "Certificate exists — re-installing HTTPS block (renews only if due)..."
  # This script copies an HTTP-only nginx config above, which would drop the
  # certbot HTTPS server block (port 443). Re-running the certbot nginx installer
  # (with --keep-until-expiring) re-adds the 443 block on every deploy without
  # needlessly re-issuing a valid certificate.
  sudo certbot --nginx \
    -d "$DOMAIN" \
    -d "$WWW_DOMAIN" \
    --redirect \
    --non-interactive \
    --keep-until-expiring || true
else
  echo "Issuing new certificate for $DOMAIN + $WWW_DOMAIN..."
  # Back up the clean HTTP config so we can restore it if issuance fails
  # (e.g. DNS not propagated yet) instead of leaving nginx in a broken state.
  sudo cp "$NGINX_CONF" /tmp/yesboss-nginx-backup.conf
  set +e
  sudo certbot --nginx \
    -d "$DOMAIN" \
    -d "$WWW_DOMAIN" \
    --redirect \
    --non-interactive \
    --agree-tos \
    --email "$SSL_EMAIL" \
    --no-eff-email \
    --keep-until-expiring
  CERTBOT_RC=$?
  set -e
  if [ "$CERTBOT_RC" -ne 0 ]; then
    echo "Certbot failed (DNS may not have propagated yet). Restoring HTTP-only config — will retry on next push."
    sudo cp /tmp/yesboss-nginx-backup.conf "$NGINX_CONF"
    sudo nginx -t
    sudo systemctl reload nginx || sudo systemctl restart nginx
  fi
fi

# --- 6. Update backend env vars baked into the image ---
echo "[6/6] Updating backend/.env.live..."
ENV_FILE="$REPO_DIR/backend/.env.live"

# CORS_ORIGINS
if grep -q "^CORS_ORIGINS=" "$ENV_FILE" 2>/dev/null; then
  sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=https://$DOMAIN,https://$WWW_DOMAIN|" "$ENV_FILE"
else
  printf "\n# Single-origin deployment\nexport CORS_ORIGINS=https://%s,https://%s\n" "$DOMAIN" "$WWW_DOMAIN" >> "$ENV_FILE"
fi

# FRONTEND_URL
if grep -q "^FRONTEND_URL=" "$ENV_FILE" 2>/dev/null; then
  sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=https://$DOMAIN|" "$ENV_FILE"
else
  printf "export FRONTEND_URL=https://%s\n" "$DOMAIN" >> "$ENV_FILE"
fi

# API_URL (used for links in emails / notifications)
if grep -q "^API_URL=" "$ENV_FILE" 2>/dev/null; then
  sed -i "s|^API_URL=.*|API_URL=https://$DOMAIN/api/v1|" "$ENV_FILE"
else
  printf "export API_URL=https://%s/api/v1\n" "$DOMAIN" >> "$ENV_FILE"
fi

# ZOHO_REDIRECT_URI / GOOGLE_REDIRECT_URI (must match the OAuth consoles)
for var in ZOHO_REDIRECT_URI GOOGLE_REDIRECT_URI; do
  if grep -q "^${var}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${var}=.*|${var}=https://$DOMAIN/api/v1/$(echo "$var" | sed 's/_REDIRECT_URI//' | tr 'A-Z' 'a-z')/callback|" "$ENV_FILE"
  else
    printf "export %s=https://%s/api/v1/%s/callback\n" "$var" "$DOMAIN" "$(echo "$var" | sed 's/_REDIRECT_URI//' | tr 'A-Z' 'a-z')" >> "$ENV_FILE"
  fi
done

# AI provider: DeepSeek primary + Gemini embeddings (DeepSeek/Grok cannot embed).
# Keys are NOT written here — the user pastes them into backend/.env.live once.
# Set/append non-secret config and empty key placeholders.
for var in DEFAULT_AI_PROVIDER DEEPSEEK_BASE_URL DEEPSEEK_MODEL EMBEDDINGS_PROVIDER; do
  if grep -q "^${var}=" "$ENV_FILE" 2>/dev/null; then
    :
  else
    printf "export %s=%s\n" "$var" "$(echo "$var" | sed -e 's/^DEFAULT_AI_PROVIDER$/deepseek/' -e 's/^DEEPSEEK_BASE_URL$/https:\/\/api.deepseek.com/' -e 's/^DEEPSEEK_MODEL$/deepseek-v4-flash/' -e 's/^EMBEDDINGS_PROVIDER$/gemini/')" >> "$ENV_FILE"
  fi
done
if grep -q "^DEFAULT_AI_PROVIDER=" "$ENV_FILE" 2>/dev/null && ! grep -q "^DEFAULT_AI_PROVIDER=deepseek" "$ENV_FILE"; then
  sed -i "s|^DEFAULT_AI_PROVIDER=.*|DEFAULT_AI_PROVIDER=deepseek|" "$ENV_FILE"
fi
for key in DEEPSEEK_API_KEY GEMINI_API_KEY; do
  if ! grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    printf "export %s=\n" "$key" >> "$ENV_FILE"
  fi
done

echo ""
echo "=== Server setup complete ==="
echo "Site:     https://$DOMAIN"
echo "Backend:  https://$DOMAIN/api/v1"
