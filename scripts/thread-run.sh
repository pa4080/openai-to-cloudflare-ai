#!/bin/bash
. .env

: ${API_KEY:="your_cloudflare_worker_api_key"}
: ${CLOUDFLARE_WORKER_URL:="your_worker_url"}
: ${THREAD_ID:="thread_abc123"} # Replace with actual thread ID
: ${ASST_ID:="asst_abc123"}     # Replace with actual assistant ID

curl -X POST "${CLOUDFLARE_WORKER_URL}/threads/${THREAD_ID}/runs" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "assistant_id": "'"$ASST_ID"'",
    "stream": false,
    "instructions": "Provide a concise response"
  }' | jq
