
interface Env {
	AI: {
		run: (request: CloudflareAiRequest) => Promise<AiResponse>;
	};
	API_KEY: string;
	DEFAULT_AI_MODEL: string;
	CACHE: KVNamespace;
}

/**
 * AI Request
 */
interface BaseInputOptions {
	stream?: boolean;
	max_tokens?: number;
	temperature?: number;
	top_p?: number;
	top_k?: number;
	seed?: number;
	repetition_penalty?: number;
	frequency_penalty?: number;
	presence_penalty?: number;
}

interface PromptInputOptions extends BaseInputOptions {
	prompt: string;
	raw?: boolean;
	lora?: string;
}

/**
 * https://platform.openai.com/docs/guides/text-generation
 * OpenAi: 'system' become 'developer'...
 * Cloudflare: The role of the message sender (e.g., 'user', 'assistant', 'system', 'tool').
 */
interface ChatMessage {
	role: 'user' | 'assistant' | 'developer' | 'system';
	content: string;
}

interface ParameterDefinition {
	type: string;
	description: string;
}

interface ToolParameterSchema {
	type: string;
	required?: string[];
	properties: Record<string, ParameterDefinition>;
}

interface Tool {
	name: string;
	description: string;
	parameters: ToolParameterSchema;
}

interface FunctionTool {
	type: string;
	function: {
		name: string;
		description: string;
		parameters: ToolParameterSchema;
	};
}

interface MessagesInputOptions extends BaseInputOptions {
	messages: ChatMessage[];
	functions?: Array<{
		name: string;
		code: string;
	}>;
	tools?: Array<Tool | FunctionTool>;
}

type Options = PromptInputOptions | MessagesInputOptions;


interface CloudflareAiRequest {
	model: Model, options: Options;
}

/**
 * AI Response
 */
interface UsageStats {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

interface ToolCall {
	arguments: Record<string, any>;
	name: string;
}

interface AiJsonResponse {
	contentType: "application/json";
	response: string;
	usage: UsageStats;
	tool_calls?: ToolCall[];
}

interface AiStreamResponse {
	contentType: "text/event-stream";
	format: ReadableStream<Uint8Array>;
}

type AiResponse = AiJsonResponse | AiStreamResponse;

/**
 * Assistant
 */
interface Assistant {
	id: string;
	object: "assistant";
	created_at: number;
	name: string | null;
	description: string | null;
	model: Model;
	instructions: string | null;
	tools: Array<{
		type: "code_interpreter" | "file_search" | "function";
		[key: string]: any;
	}>;
	metadata: Record<string, any>;
	temperature: number | null;
	top_p: number | null;
	response_format: "auto" | { type: string; };
}

interface AssistantCreateParams {
	name: string;
	description?: string;
	model?: string;
	tools?: any[];
	metadata?: Record<string, any>;
}

/**
 * Models
 */
const date = new Date().toDateString();
const models = [{
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

type ModelType = typeof models[number];
type Model = ModelType['id'];

/**
 * ChatCompletions Request
 */
interface OpenAiChatCmplReq {
	messages: ChatMessage[];
	model: Model;
	store?: boolean | null;
	reasoning_effort?: 'low' | 'medium' | 'high' | null;
	metadata?: Record<string, string>; // Key<=64 chars, Value<=512 chars
	frequency_penalty?: number | null; // Between -2.0 and 2.0
	logit_bias?: Record<number, number>; // Token ID to bias (-100 to 100)
	logprobs?: boolean | null;
	top_logprobs?: number | null; // 0-20 when logprobs=true
	/** @deprecated Use max_completion_tokens instead */
	max_tokens?: number | null;
	max_completion_tokens?: number | null;
	n?: number | null; // Default 1
	modalities?: ('text' | 'audio')[] | null;
	prediction?: Record<string, any>; // Prediction configuration
	audio?: Record<string, any> | null; // Audio output parameters
	presence_penalty?: number | null; // Between -2.0 and 2.0
	response_format?:
	| { type: 'text'; }
	| { type: 'json_object'; }
	| { type: 'json_schema'; json_schema: Record<string, any>; };
	seed?: number | null;
	service_tier?: 'auto' | 'default' | string | null;
	stop?: string | string[] | null; // Up to 4 sequences
	stream?: boolean | null;
	stream_options?: {
		include_usage?: boolean;
	} | null;
	temperature?: number | null; // 0-2, default 1
	top_p?: number | null; // 0-1, default 1
	tools?: Array<{
		type: 'function';
		function: {
			name: string;
			description?: string;
			parameters: Record<string, any>;
		};
	}>; // Max 128 tools
	tool_choice?:
	| 'none'
	| 'auto'
	| 'required'
	| { type: 'function'; function: { name: string; }; };
	parallel_tool_calls?: boolean; // Default true
	user?: string; // End-user identifier
	/** @deprecated Use tool_choice instead */
	function_call?:
	| 'none'
	| 'auto'
	| { name: string; };
	/** @deprecated Use tools instead */
	functions?: Array<{
		name: string;
		description?: string;
		parameters: Record<string, any>;
	}>;
}
