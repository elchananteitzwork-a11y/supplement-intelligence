#!/usr/bin/env bash
# reddit-activate.sh — run once after you have Reddit credentials.
# Usage: REDDIT_CLIENT_ID=xxx REDDIT_CLIENT_SECRET=yyy REDDIT_USERNAME=zzz ./scripts/reddit-activate.sh
# Or:    ./scripts/reddit-activate.sh <client_id> <client_secret> <reddit_username>

set -euo pipefail

# ── Accept credentials from args or env ──────────────────────────────────────
CLIENT_ID="${1:-${REDDIT_CLIENT_ID:-}}"
CLIENT_SECRET="${2:-${REDDIT_CLIENT_SECRET:-}}"
USERNAME="${3:-${REDDIT_USERNAME:-}}"

if [[ -z "$CLIENT_ID" || -z "$CLIENT_SECRET" || -z "$USERNAME" ]]; then
  echo "Usage: $0 <client_id> <client_secret> <reddit_username>"
  echo "Or set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME in environment."
  exit 1
fi

echo "╔══════════════════════════════════════════════════════════╗"
echo "║         Reddit Signal Engine — Activation Script        ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Verify credentials work against Reddit API ───────────────────────
echo "Step 1/5 — Verifying Reddit OAuth2 credentials..."
CREDS_B64=$(echo -n "${CLIENT_ID}:${CLIENT_SECRET}" | base64)
# Use -s (silent) not -sf so we get the body even on 4xx responses
TOKEN_RESP=$(curl -s --compressed -X POST "https://www.reddit.com/api/v1/access_token" \
  -H "Authorization: Basic ${CREDS_B64}" \
  -H "User-Agent: supplement-intelligence/1.0 by /u/${USERNAME}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" 2>/dev/null) || true

if [[ -z "$TOKEN_RESP" ]]; then
  echo "  ✗ Reddit API unreachable — check network connectivity"
  exit 1
fi

ACCESS_TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null || echo "")
if [[ -z "$ACCESS_TOKEN" ]]; then
  ERR=$(echo "$TOKEN_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error','unknown'))" 2>/dev/null || echo "parse_error")
  echo "  ✗ Token exchange failed: ${ERR}"
  echo "  Response: ${TOKEN_RESP:0:200}"
  exit 1
fi
echo "  ✓ OAuth2 token obtained: ${ACCESS_TOKEN:0:12}..."

# ── Step 2: Test a real Reddit search ────────────────────────────────────────
echo ""
echo "Step 2/5 — Testing real Reddit search (r/Supplements)..."
SEARCH_RESP=$(curl -sf \
  "https://oauth.reddit.com/r/Supplements+nutrition+GutHealth+sleep+hormones/search?q=gut+health&sort=new&t=year&limit=10&type=link&restrict_sr=1" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "User-Agent: supplement-intelligence/1.0 by /u/${USERNAME}" \
  -H "Accept: application/json" 2>/dev/null) || true

POST_COUNT=$(echo "$SEARCH_RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
posts=d.get('data',{}).get('children',[])
print(len(posts))
" 2>/dev/null || echo "0")

if [[ "$POST_COUNT" -lt "1" ]]; then
  echo "  ✗ Search returned 0 posts — check credentials and try again"
  exit 1
fi

SAMPLE=$(echo "$SEARCH_RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
posts=d.get('data',{}).get('children',[])
for p in posts[:3]:
    pd=p['data']
    print(f'  r/{pd[\"subreddit\"]} | score={pd[\"score\"]} | {pd[\"title\"][:55]}')
" 2>/dev/null || echo "  (could not parse)")
echo "  ✓ Search returned ${POST_COUNT} posts. Sample:"
echo "$SAMPLE"

# ── Step 3: Write to .env.local ───────────────────────────────────────────────
echo ""
echo "Step 3/5 — Writing to .env.local..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env.local"

# Remove old REDDIT lines if present
grep -v "^REDDIT_" "$ENV_FILE" > /tmp/env_no_reddit 2>/dev/null && mv /tmp/env_no_reddit "$ENV_FILE" || true

cat >> "$ENV_FILE" << ENVEOF

REDDIT_CLIENT_ID=${CLIENT_ID}
REDDIT_CLIENT_SECRET=${CLIENT_SECRET}
REDDIT_USERNAME=${USERNAME}
ENVEOF
echo "  ✓ Written to .env.local"

# ── Step 4: Add to Vercel ─────────────────────────────────────────────────────
echo ""
echo "Step 4/5 — Adding to Vercel (Production + Preview + Development)..."

for ENV in production preview development; do
  # Remove existing if present (ignore errors)
  echo "$CLIENT_SECRET" | npx vercel env rm REDDIT_CLIENT_SECRET "$ENV" --yes 2>/dev/null || true
  echo "$CLIENT_ID"     | npx vercel env rm REDDIT_CLIENT_ID     "$ENV" --yes 2>/dev/null || true
  echo "$USERNAME"      | npx vercel env rm REDDIT_USERNAME       "$ENV" --yes 2>/dev/null || true

  printf "%s" "$CLIENT_ID"     | npx vercel env add REDDIT_CLIENT_ID     "$ENV" 2>/dev/null
  printf "%s" "$CLIENT_SECRET" | npx vercel env add REDDIT_CLIENT_SECRET "$ENV" 2>/dev/null
  printf "%s" "$USERNAME"      | npx vercel env add REDDIT_USERNAME       "$ENV" 2>/dev/null
  echo "  ✓ ${ENV}"
done

# ── Step 5: Trigger redeploy ──────────────────────────────────────────────────
echo ""
echo "Step 5/5 — Triggering production redeploy..."
cd "${SCRIPT_DIR}/.."
git push origin main 2>/dev/null || echo "  (nothing to push)"

# Wait for Vercel to pick it up and start building
sleep 5
LATEST=$(npx vercel ls supplement-intelligence 2>/dev/null | grep "Building\|Ready" | head -1 | awk '{print $2}')
echo "  ✓ Vercel deployment: ${LATEST}"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✓ All automated steps complete.                        ║"
echo "║  Run scripts/reddit-verify.sh to confirm live signals.  ║"
echo "╚══════════════════════════════════════════════════════════╝"
