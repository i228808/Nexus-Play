#!/bin/bash
# scripts/build-appimage.sh
# Builds AppImage target for Nexus Play using electron-builder

set -e

echo "=== [AppImage Builder] Starting build ==="
cd "$(dirname "$0")/.."

# 1. Run monorepo build
npm run build

# 2. Package AppImage specifically
echo "=== [AppImage Builder] Running electron-builder AppImage target ==="
npx electron-builder --linux AppImage --project=apps/desktop -c.electronVersion=29.1.0

echo "=== [AppImage Builder] Done. AppImage generated in apps/desktop/dist/ ==="
