#!/bin/sh
# Pulls the latest zappd code into this folder. Keeps your .env, package.json and installed packages.
set -e
[ -f app.config.ts ] || { echo "Run this inside your zappd folder."; exit 1; }
tmp=$(mktemp -d)
curl -fsSL https://codeload.github.com/crprakashreddy-sys/arena-compare/tar.gz/refs/heads/zappd | tar -xz -C "$tmp"
rsync -a --exclude .env --exclude node_modules --exclude .npmrc --exclude .expo \
  --exclude package.json --exclude package-lock.json "$tmp/arena-compare-zappd/" ./
rm -rf "$tmp"
echo "zappd updated ✓"
