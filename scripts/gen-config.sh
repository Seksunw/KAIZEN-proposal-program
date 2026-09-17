#!/usr/bin/env bash
# Generates js/config.js from env vars at deploy time (Vercel build command — see
# vercel.json). js/config.js itself is gitignored (real Supabase URL + anon key never
# committed) — locally, copy js/config.js.example instead; this script is only for
# hosts that inject secrets via env vars.
set -euo pipefail

: "${SUPABASE_URL:?SUPABASE_URL env var not set}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY env var not set}"

cat > js/config.js <<EOF
export const SUPABASE_URL = '${SUPABASE_URL}';
export const SUPABASE_ANON_KEY = '${SUPABASE_ANON_KEY}';

export const MAX_UPLOAD_MB = ${MAX_UPLOAD_MB:-20};
EOF

echo "js/config.js generated"
