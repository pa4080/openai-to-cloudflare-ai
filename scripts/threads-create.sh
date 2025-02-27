#!/bin/bash
. .env

: ${API_KEY:="your_cloudflare_worker_api_key"}
: ${CLOUDFLARE_WORKER_URL:="your_worker_url"}

curl -X POST "${CLOUDFLARE_WORKER_URL}/threads" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello, I need help with testing"}
    ],
    "metadata": {"context": "testing"}
  }' | jq
