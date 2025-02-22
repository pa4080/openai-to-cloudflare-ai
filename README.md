# OpenAI to Llama 3 AI

This is example of using [Workers AI](https://developers.cloudflare.com/workers-ai/). This Cloudflare Worker provides a Base URL which allows you to make AI calls to the @cf/meta/llama-3-8b-instruct model using an OpenAI client.

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

| Tested and working endpoints |
| ---------------------------- |

| Endpoint                  | Method | Description                      | Script Call from the Project Root |
| ------------------------- | ------ | -------------------------------- | --------------------------------- |
| /models/search            | GET    | Lists all models (no auth)       | Open in a browser HTML output     |
| /models/search?query=json | GET    | Lists all models (no auth)       | Open in a browser JSON output     |
| /v1/models                | GET    | Lists all models                 | scripts/models.sh                 |
| /v1/models                | POST   | Lists all models                 | scripts/models.sh                 |
| /v1/chat/completions      | POST   | Creates a chat completion        | scripts/chat-completion.sh        |
| /v1/chat/completions      | POST   | Creates a chat completion stream | scripts/chat-completion-stream.sh |
| /v1/embeddings            | POST   | Creates an embedding (3+2 tests) | scripts/embeddings.sh             |

| Endpoints under development |
| --------------------------- |

| Endpoint             | Method | Description                           | Script Call from the Project Root |
| -------------------- | ------ | ------------------------------------- | --------------------------------- |
| /v1/assistants       | POST   | Creates an assistant                  |                                   |
| /v1/assistants       | GET    | Lists all assistants                  |                                   |
| /v1/assistants/:id   | GET    | Retrieves an assistant                |                                   |
| /v1/assistants/:id   | POST   | Modifies an assistant                 |                                   |
| /v1/assistants/:id   | DELETE | Deletes an assistant                  |                                   |
| /v1/threads          | POST   | Creates a thread                      |                                   |
| /v1/threads/:id      | GET    | Retrieves a thread                    |                                   |
| /v1/threads/:id      | POST   | Modifies a thread                     |                                   |
| /v1/threads/:id      | DELETE | Deletes a thread                      |                                   |
| /v1/threads/:id/runs | POST   | Creates a run for a thread            |                                   |
| /v1/threads/:id/runs | POST   | Creates a run for a thread  streaming |                                   |

## Author

- Jack Culpan <https://github.com/jackculpan>
- Spas Spasov <https://github.com/pa4080>

## References

- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Cloudflare AI Models Reference](https://developers.cloudflare.com/workers-ai/models)
- [Cloudflare AI SDK](https://developers.cloudflare.com/workers-ai/configuration/ai-sdk/)
- [Cloudflare OpenAI compatible API endpoints](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/)
- [Cloudflare Vectorize](https://developers.cloudflare.com/vectorize/get-started/embeddings/)
- [DeepSeek: Helping with OpenAI to CfWorkerAI Part1](https://chat.deepseek.com/a/chat/s/71155bf0-ee66-46a4-9599-ab074c39e447)
- [DeepSeek: Helping with OpenAI to CfWorkerAI Part2](https://chat.deepseek.com/a/chat/s/38512169-41af-4a4b-8e8f-b3c1b0affa07)
- [DeepSeek: Helping with OpenAI to CfWorkerAI Part3](hhttps://chat.deepseek.com/a/chat/s/bc1f4584-b831-4364-9b5a-775f740c866d)
- [Grok: Helping with OpenAI to CfWorkerAI Part1](https://grok.com/share/bGVnYWN5_4b174cf5-98ab-41b0-902c-621dbcf6150e)

## License

MIT
