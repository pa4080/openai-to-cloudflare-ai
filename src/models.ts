// import { modelSettings } from "@cloudflare/ai/dist/ai/catalog";

const date = new Date().toDateString();
export const models = [{
	id: "@cf/meta/llama-3-8b-instruct",
	object: "model",
	created: date,
	owned_by: "cloudflare",
	description: "Generation over generation, Meta Llama 3 demonstrates state-of-the-art performance on a wide range of industry benchmarks and offers new capabilities, including improved reasoning."
}, {
	id: "@cf/meta/llama-3.2-1b-instruct",
	object: "model",
	created: date,
	owned_by: "cloudflare",
	description: "The Llama 3.2 instruction-tuned text only models are optimized for multilingual dialogue use cases, including agentic retrieval and summarization tasks."
}, {
	id: "@cf/meta/llama-3.2-3b-instruct",
	object: "model",
	created: date,
	owned_by: "cloudflare",
	description: "The Llama 3.2 instruction-tuned text only models are optimized for multilingual dialogue use cases, including agentic retrieval and summarization tasks."
}, {
	id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
	object: "model",
	created: date,
	owned_by: "cloudflare",
	description: "Llama 3.3 70B quantized to fp8 precision, optimized to be faster."
}, {
	id: "@cf/mistral/mistral-7b-instruct-v0.1",
	object: "model",
	created: date,
	owned_by: "cloudflare",
	description: "Instruct fine-tuned version of the Mistral-7b generative text model with 7 billion parameters."
}, {
	id: "@hf/mistral/mistral-7b-instruct-v0.2",
	object: "model",
	created: date,
	owned_by: "cloudflare",
	description: "(beta) The Mistral-7B-Instruct-v0.2 Large Language Model (LLM) is an instruct fine-tuned version of the Mistral-7B-v0.2. Mistral-7B-v0.2 has the following changes compared to Mistral-7B-v0.1: 32k context window (vs 8k context in v0.1), rope-theta = 1e6, and no Sliding-Window Attention."
}] as const;
