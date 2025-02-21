# OpenAI to Llama 3 AI

This is example of using [Workers AI](https://developers.cloudflare.com/workers-ai/). This Cloudflare Worker provides a Base URL which allows you to make AI calls to the @cf/meta/llama-3-8b-instruct model using an OpenAI client.

## Deployment and test

You need to have a Cloudflare account and the [Wrangler](https://developers.cloudflare.com/workers/cli-wrangler/) installed.

### Step 1. Deploy

```txt
cp .env.example .env
pnpm i
pnpm run deploy
pnpm run api-key
```

At this point you should have a setup Cloudflare Worker that you can use to make AI calls to the @cf/meta/llama-3-8b-instruct and other CF models using an OpenAI client.

### Step 2. Test

Tweak the [`.env`](.env.example) file created in Step 1. There should be a `CLOUDFLARE_WORKER_URL` and `API_KEY` variable.
You can obtain the worker URL from the Cloudflare Workers dashboard. You can obtain the API key from the Cloudflare Workers dashboard.

```bash
scripts/test-api.sh
```

## Author

- Jack Culpan <https://github.com/jackculpan>
- Spas Spasov <https://github.com/pa4080>

## License

MIT
