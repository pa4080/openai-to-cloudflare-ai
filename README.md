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
wrangler secret put CF_API_KEY <<<(Your Cloudflare API Key/Token)
wrangler secret put CF_ACCOUNT_ID <<<(Your Cloudflare Account ID)
```

Otherwise a limited predefined list of [models](./src/models.ts) will be available.

### Step 3. Test

Tweak the [`.env`](.env.example) file created in Step 1. There should be a `CLOUDFLARE_WORKER_URL` and `API_KEY` variable.
You can obtain the worker URL from the Cloudflare Workers dashboard. You can obtain the API key from the Cloudflare Workers dashboard.

```bash
scripts/test-api.sh
```

## Author

- Jack Culpan <https://github.com/jackculpan>
- Spas Spasov <https://github.com/pa4080>

## References

- <https://platform.openai.com/docs/api-reference>
- <https://developers.cloudflare.com/workers-ai/models>
- <https://chat.deepseek.com/a/chat/s/71155bf0-ee66-46a4-9599-ab074c39e447>

## License

MIT
