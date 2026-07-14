#!/bin/bash
# ===================================================
# VM Setup Script for VSSPLVPSLINUX01
# ===================================================
# Run this ONCE on the VM before the first deployment.
# Usage:  chmod +x scripts/vm-setup.sh && sudo ./scripts/vm-setup.sh
# ===================================================
set -e

echo "============================================"
echo " YesBoss VM Setup — VSSPLVPSLINUX01"
echo " Ubuntu 24.04 | Standard B4ms"
echo "============================================"
echo ""

# ── 1. Install Docker Engine ──
echo "[1/5] Installing Docker Engine..."
if command -v docker &> /dev/null; then
    echo "       Docker already installed: $(docker --version)"
else
    # Remove old conflicting packages
    for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
        sudo apt-get remove -y "$pkg" 2>/dev/null || true
    done

    # Add Docker's official GPG key
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl
    sudo install -m 0755 -d /etc/apt/keyrings
    sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc

    # Add the repository to apt sources
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    echo "       Docker installed: $(docker --version)"
fi

# ── 2. Configure Docker to use /u01 data disk ──
echo "[2/5] Configuring Docker data root → /u01/docker-data..."
sudo mkdir -p /u01/docker-data

# Create or update Docker daemon config
if [ ! -f /etc/docker/daemon.json ]; then
    sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
  "data-root": "/u01/docker-data",
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
    echo "       Created /etc/docker/daemon.json"
else
    echo "       /etc/docker/daemon.json already exists — verify data-root is set to /u01/docker-data"
fi

# Restart Docker to apply the new data-root
sudo systemctl restart docker
echo "       Docker data-root: $(docker info 2>/dev/null | grep 'Docker Root Dir')"

# ── 3. Add vpsuser to docker group ──
echo "[3/5] Adding vpsuser to docker group..."
sudo usermod -aG docker vpsuser
echo "       vpsuser added to docker group (re-login required)"

# ── 4. Create required directories ──
echo "[4/5] Creating required directories on /u01..."
sudo mkdir -p /u01/docker-data/uploads
sudo chown -R vpsuser:vpsuser /u01/docker-data/uploads
echo "       /u01/docker-data/uploads created"

# ── 5. Clone repo (if not already present) ──
echo "[5/5] Checking project repo..."
if [ -d /home/vpsuser/yesboss2 ]; then
    echo "       ~/yesboss2 already exists"
else
    echo "       Cloning repo to ~/yesboss2..."
    echo "       ⚠  Run this manually as vpsuser:"
    echo "       git clone <YOUR_REPO_URL> ~/yesboss2"
fi

echo ""
echo "============================================"
echo " ✅ VM Setup Complete!"
echo "============================================"
echo ""
echo " Next steps:"
echo "   1. Log out and back in (for docker group)"
echo "   2. Place firebase-credentials.json at:"
echo "      ~/yesboss2/backend/firebase-credentials.json"
echo "   3. Verify .env.live is at:"
echo "      ~/yesboss2/backend/.env.live"
echo "   4. Test: cd ~/yesboss2 && docker compose up -d --build"
echo ""
echo " GitHub Secrets needed:"
echo "   SSH_HOST = 52.140.177.20"
echo "   SSH_KEY  = (your private SSH key)"
echo ""
