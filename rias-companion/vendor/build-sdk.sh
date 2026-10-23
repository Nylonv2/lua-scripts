#!/usr/bin/env bash
# Rebuilds vendor/anthropic-sdk.js: the official Anthropic JS SDK bundled into one
# browser file that sets window.Anthropic. Needs Node.js and npm.
set -euo pipefail
OUT="$(cd "$(dirname "$0")" && pwd)/anthropic-sdk.js"
TMP=$(mktemp -d)
cd "$TMP"
npm init -y >/dev/null
npm install --silent @anthropic-ai/sdk esbuild
echo "import Anthropic from '@anthropic-ai/sdk'; window.Anthropic = Anthropic;" > entry.js
npx esbuild entry.js --bundle --minify --format=iife --platform=browser --target=chrome90 --legal-comments=eof --outfile="$OUT"
rm -rf "$TMP"
echo "Built $OUT"
