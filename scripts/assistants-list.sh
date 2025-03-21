#!/bin/bash
. .env

: ${API_KEY:="your_cloudflare_worker_api_key"}
: ${CLOUDFLARE_WORKER_URL:="your_worker_url"}

curl -X GET "${CLOUDFLARE_WORKER_URL}/assistants" \
  -H "Authorization: Bearer $API_KEY" | jq
