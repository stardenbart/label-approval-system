#!/bin/bash
# deploy/firewall.sh — UFW Firewall setup for DAL system
# Run: sudo bash deploy/firewall.sh

set -euo pipefail

echo "[UFW] Configuring firewall..."

# Reset
ufw --force reset

# Default: deny incoming, allow outgoing
ufw default deny incoming
ufw default allow outgoing

# SSH — IMPORTANT: make sure this is correct before enabling
ufw allow 22/tcp comment "SSH"

# HTTP and HTTPS
ufw allow 80/tcp  comment "HTTP"
ufw allow 443/tcp comment "HTTPS"

# Block direct access to backend port from outside
# (3001 only accessible via Nginx proxy on localhost)
ufw deny 3001/tcp comment "Backend - internal only"

# MySQL — only localhost (never expose to internet)
ufw deny 3306/tcp comment "MySQL - internal only"

# Enable
ufw --force enable
ufw status verbose

echo ""
echo "[UFW] ✅ Firewall configured"
echo "      Open ports: 22 (SSH), 80 (HTTP), 443 (HTTPS)"
echo "      Blocked: 3001 (backend), 3306 (MySQL)"
