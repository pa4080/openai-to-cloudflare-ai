# Translation API: OpenAI to Cloudflare AI

Cloudflare Worker that provides a Base URL for making AI requests to [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) using an OpenAI client or call format.  

Features:
 - Supports AI calls via OpenAI-compatible clients  
 - Token-protected API for secure access  
 - Utilizes KV and AI from the Clodflare Worker's Enviroonment
 - Hives access to all Clodflare's AI models, but doen't translate all possible calls
 - Example usage available in the [`scripts/`](scripts/) folder

Purpose:
- The primary goal of this worker is to facilitate basic operations within the [n8n](https://n8n.io/) workflow automation tool.
- Now it can be used for simple LLM chains and embeddings.


## Deployment and test

You need to have a Cloudflare account and the [Wrangler](https://developers.cloudflare.com/workers/cli-wrangler/) installed.

### Step 0. Configuration

Edit `wrangler.toml` and change the worker name if you want to use a different name. Then generate the KV namespace and agan update the `wrangler.toml` file.

```bash
 wrangler kv:namespace create kv
 wrangler kv:namespace create kv --preview
 ```

### Step 1. Deploy

```bash
cp .env.example .env
pnpm i
pnpm run deploy
pnpm run api-key
```

At this point you should have a setup Cloudflare Worker that you can use to make AI calls to the @cf/meta/llama-3-8b-instruct and other CF models using an OpenAI client.

### Step 2. Additional Credentials

In order to automatically fetch the list of the available AI models you need to add the `CF_API_KEY` and `CF_ACCOUNT_ID` to the cloudflare workers secret.

```bash
wrangler secret put CF_API_KEY <<<"Your Cloudflare API Key/Token"
wrangler secret put CF_ACCOUNT_ID <<<"Your Cloudflare Account ID"
```

Otherwise a limited predefined list of [models](./src/models.ts) will be available.

### Step 3. Test

Tweak the [`.env`](.env.example) file created in Step 1.  There should be a `CLOUDFLARE_WORKER_URL` and `API_KEY` variable.

- You can obtain/setup the worker URL from the Cloudflare Workers dashboard.
- In the dev mode you can use `localhost:3000/v1`...
- Also you can set `[dev] host = "dev-worker.example.com"` in the `wrangler.toml` file.
- Then use cloudflare tunnel to expose the worker.
- You can obtain/generate the API key/token from the Cloudflare Workers dashboard.

To test all possible paths and methods currently implemented in our Cloudflare Worker, there are prepared fel scripts in the [scripts](./scripts) folder. In each scripts have instructions and list of envvars that could be either exported in the shell or placed int the [`.env`](.env) file.

 | Endpoint                  | Method | Description                                 | Script Call from the Project Root                                                                    |
 | ------------------------- | ------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
 | /models/search            | GET    | Lists all models (no auth)                  | Open in a browser HTML output                                                                        |
 | /models/search?query=json | GET    | Lists all models (no auth)                  | Open in a browser JSON output                                                                        |
 | /v1/models                | GET    | Lists all models                            | [`scripts/models.sh`](./scripts/models.sh)                                                           |
 | /v1/chat/completions      | POST   | Creates a chat completion                   | [`scripts/chat-completion.sh`](./scripts/chat-completion.sh)                                         |
 | /v1/chat/completions      | POST   | Creates a chat completion stream            | [`scripts/chat-completion-stream.sh`](./scripts/chat-completion-stream.sh)                           |
 | /v1/embeddings            | POST   | Creates an embedding (3+2 tests)            | [`scripts/embeddings.sh`](./scripts/embeddings.sh)                                                   |
 |                           |        |                                             |                                                                                                      |
 | /v1/assistants            | POST   | Creates an assistant. Check the KV storage. | [`scripts/assistants-create.sh`](./scripts/assistants-create.sh)                                     |
 | /v1/assistants            | GET    | Lists all assistants                        | [`scripts/assistants-list.sh`](./scripts/assistants-list.sh)                                         |
 | /v1/assistants/:id        | GET    | Retrieves an assistant                      | [`ASST_ID=asst_abc scripts/assistant-retrieve.sh`](./scripts/assistant-retrieve.sh)                  |
 | /v1/assistants/:id        | POST   | Modifies an assistant                       | [`ASST_ID=asst_abc scripts/assistant-modify.sh`](./scripts/assistant-modify.sh)                      |
 | /v1/assistants/:id        | DELETE | Deletes an assistant                        | [`ASST_ID=asst_abc scripts/assistant-delete.sh`](./scripts/assistant-delete.sh)                      |
 | /v1/threads               | POST   | Creates a thread                            | [`scripts/threads-create.sh`](./scripts/threads-create.sh)                                           |
 | /v1/threads/:id           | GET    | Retrieves a thread                          | [`THREAD_ID=thread_abc scripts/thread-retrieve.sh`](scripts/thread-retrieve.sh)                      |
 | /v1/threads/:id           | POST   | Modifies a thread                           | [`THREAD_ID=thread_abc scripts/thread-modify.sh`](scripts/thread-modify.sh)                          |
 | /v1/threads/:id           | DELETE | Deletes a thread                            | [`THREAD_ID=thread_abc scripts/thread-delete.sh`](scripts/thread-delete.sh)                          |
 | /v1/threads/:id/runs      | POST   | Creates a run for a thread                  | [`THREAD_ID=thread_abc ASST_ID=asst_abc scripts/thread-run.sh`](scripts/thread-run.sh)               |
 | /v1/threads/:id/runs      | POST   | Creates a run for a thread  streaming       | [`THREAD_ID=thread_abc ASST_ID=asst_abc scripts/thread-run-stream.sh`](scripts/thread-run-stream.sh) |

Notes:

- The threads will run with model `@hf/mistral/mistral-7b-instruct-v0.2`, because we set it up in the `assistants-create.sh` script.

## Author

- Spas Spasov <https://github.com/pa4080>, 2025
- Based on the idea, provided by Jack Culpan <https://github.com/jackculpan>

## References

- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Cloudflare AI Models Reference](https://developers.cloudflare.com/workers-ai/models)
- [Cloudflare AI SDK](https://developers.cloudflare.com/workers-ai/configuration/ai-sdk/)
- [Cloudflare OpenAI compatible API endpoints](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/)
- [Cloudflare Vectorize](https://developers.cloudflare.com/vectorize/get-started/embeddings/)
- [Cloudflare Agents](https://developers.cloudflare.com/agents/)
- [DeepSeek: Helping with OpenAI to CfWorkerAI Part1](https://chat.deepseek.com/a/chat/s/71155bf0-ee66-46a4-9599-ab074c39e447)
- [DeepSeek: Helping with OpenAI to CfWorkerAI Part2](https://chat.deepseek.com/a/chat/s/38512169-41af-4a4b-8e8f-b3c1b0affa07)
- [DeepSeek: Helping with OpenAI to CfWorkerAI Part3](hhttps://chat.deepseek.com/a/chat/s/bc1f4584-b831-4364-9b5a-775f740c866d)
- [Grok: Helping with OpenAI to CfWorkerAI Part1](https://grok.com/share/bGVnYWN5_4b174cf5-98ab-41b0-902c-621dbcf6150e)

## License

MIT
