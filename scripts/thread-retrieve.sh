#!/bin/bash
. .env

: ${API_KEY:="your_cloudflare_worker_api_key"}
: ${CLOUDFLARE_WORKER_URL:="your_worker_url"}
: ${THREAD_ID:="thread_abc123"} # Replace with actual thread ID

curl -X GET "${CLOUDFLARE_WORKER_URL}/threads/${THREAD_ID}" \
  -H "Authorization: Bearer $API_KEY" | jq
