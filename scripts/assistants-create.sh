#!/bin/bash
. .env

: ${API_KEY:="your_cloudflare_worker_api_key"}
: ${CLOUDFLARE_WORKER_URL:="your_worker_url"}

curl -X POST "${CLOUDFLARE_WORKER_URL}/assistants" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "@hf/mistral/mistral-7b-instruct-v0.2",
    "name": "Test Assistant",
    "description": "A test assistant for script validation",
    "instructions": "Assist with basic queries",
    "tools": [
      {"type": "code_interpreter"}
    ],
    "metadata": {"purpose": "testing"}
  }' | jq
