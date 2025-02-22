#!/bin/bash
. .env

: ${API_KEY:="your_cloudflare_worker_api_key"}
: ${CLOUDFLARE_WORKER_URL:="your_worker_url"}
: ${ASST_ID:="asst_abc123"} # Replace with actual assistant ID

curl -X GET "${CLOUDFLARE_WORKER_URL}/assistants/${ASST_ID}" \
  -H "Authorization: Bearer $API_KEY" | jq
