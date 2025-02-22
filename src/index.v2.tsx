export default {
  async fetch(request: Request, env: Env) {
    // Authorization check
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ') || authHeader.split(' ')[1] !== env.API_KEY) {
      return new Response(JSON.stringify({ error: { message: "Unauthorized", type: "auth_error" } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);

    // Models endpoint
    if (url.pathname === '/v1/models') {
      return this.handleListModels();
    }

    // Assistants endpoints
    if (url.pathname.startsWith('/v1/assistants')) {
      return this.handleAssistants(request, env, url);
    }

    // Chat completions
    if (url.pathname === '/v1/chat/completions') {
      return this.handleChatCompletions(request, env);
    }

    return new Response(JSON.stringify({ error: { message: "Not found", type: "invalid_request" } }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  },

  async handleListModels() {
    return new Response(JSON.stringify({
      object: "list",
      data: [{
        id: "@cf/meta/llama-3-8b-instruct",
        object: "model",
        created: Date.now(),
        owned_by: "cloudflare",
        description: "Generation over generation, Meta Llama 3 demonstrates state-of-the-art performance on a wide range of industry benchmarks and offers new capabilities, including improved reasoning."
      }, {
        id: "@cf/meta/llama-3.2-1b-instruct",
        object: "model",
        created: Date.now(),
        owned_by: "cloudflare",
        description: "The Llama 3.2 instruction-tuned text only models are optimized for multilingual dialogue use cases, including agentic retrieval and summarization tasks."
      }, {
        id: "@cf/meta/llama-3.2-3b-instruct",
        object: "model",
        created: Date.now(),
        owned_by: "cloudflare",
        description: "The Llama 3.2 instruction-tuned text only models are optimized for multilingual dialogue use cases, including agentic retrieval and summarization tasks."
      }, {
        id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        object: "model",
        created: Date.now(),
        owned_by: "cloudflare",
        description: "Llama 3.3 70B quantized to fp8 precision, optimized to be faster."
      }, {
        id: "@cf/mistral/mistral-7b-instruct-v0.1",
        object: "model",
        created: Date.now(),
        owned_by: "cloudflare",
        description: "Instruct fine-tuned version of the Mistral-7b generative text model with 7 billion parameters."
      }, {
        id: "@hf/mistral/mistral-7b-instruct-v0.2",
        object: "model",
        created: Date.now(),
        owned_by: "cloudflare",
        description: "(beta) The Mistral-7B-Instruct-v0.2 Large Language Model (LLM) is an instruct fine-tuned version of the Mistral-7B-v0.2. Mistral-7B-v0.2 has the following changes compared to Mistral-7B-v0.1: 32k context window (vs 8k context in v0.1), rope-theta = 1e6, and no Sliding-Window Attention."
      }]
    }), { headers: { 'Content-Type': 'application/json' } });
  },

  async handleAssistants(request: Request, env: Env, url: URL) {
    try {
      const assistantId = url.pathname.split('/').pop() || '';
      const key = `assistant:${assistantId}`;

      // Create Assistant
      if (request.method === 'POST' && url.pathname === '/v1/assistants') {
        const data = await request.json() as Partial<Assistant>;

        // Validation
        if (!data.model) return this.errorResponse("Model is required", 400);
        if (data.name && data.name.length > 256) return this.errorResponse("Name exceeds 256 characters", 400);
        if (data.description && data.description.length > 512) return this.errorResponse("Description exceeds 512 characters", 400);

        const assistant: Assistant = {
          id: `asst_${crypto.randomUUID()}`,
          object: "assistant",
          created_at: Math.floor(Date.now() / 1000),
          name: data.name || null,
          description: data.description || null,
          model: data.model,
          instructions: data.instructions || null,
          tools: data.tools || [],
          metadata: data.metadata || {},
          temperature: data.temperature ?? 1.0,
          top_p: data.top_p ?? 1.0,
          response_format: data.response_format || "auto"
        };

        await env.CACHE.put(key, JSON.stringify(assistant), {
          metadata: { created_at: assistant.created_at },
          expirationTtl: 2592000 // 30 days
        });

        return new Response(JSON.stringify(assistant), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get Assistant
      if (request.method === 'GET' && assistantId) {
        const assistant = await env.CACHE.get<Assistant>(key, "json");
        if (!assistant) return this.errorResponse("Assistant not found", 404);
        return new Response(JSON.stringify(assistant), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // List Assistants
      if (request.method === 'GET') {
        const list = await env.CACHE.list({ prefix: "assistant:" });
        const assistants = await Promise.all(
          list.keys.map(async k => await env.CACHE.get<Assistant>(k.name, "json"))
        );

        return new Response(JSON.stringify({
          object: "list",
          data: assistants.filter(Boolean),
          has_more: false
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Delete Assistant
      if (request.method === 'DELETE' && assistantId) {
        await env.CACHE.delete(key);
        return new Response(JSON.stringify({
          id: assistantId,
          object: "assistant.deleted",
          deleted: true
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return this.errorResponse("Method not allowed", 405);

    } catch (error) {
      return this.errorResponse("Assistant operation failed", 500, (error as Error).message);
    }
  },

  async handleChatCompletions(request: Request, env: Env) {
    try {
      const data = await request.json() as {
        model?: string;
        messages: Array<{ role: string; content: string; }>;
        assistant_id?: string;
      };

      // Get Assistant configuration
      let assistant: Assistant | null = null;
      if (data.assistant_id) {
        assistant = await env.CACHE.get<Assistant>(`assistant:${data.assistant_id}`, "json");
      }

      // Prepare AI parameters
      const aiParams = {
        messages: data.messages.map(({ role, content }) => ({ role, content })),
        temperature: assistant?.temperature ?? 0.6,
        top_p: assistant?.top_p ?? 1.0,
        tools: assistant?.tools ? this.mapTools(assistant.tools) : []
      };

      // Run inference
      const result = await env.AI.run(assistant?.model || env.DEFAULT_AI_MODEL, aiParams);

      // Format response
      return new Response(JSON.stringify({
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: assistant?.model || env.DEFAULT_AI_MODEL,
        choices: [{
          message: {
            content: result.response,
            role: "assistant",
            ...(result?.tool_calls && { tool_calls: result.tool_calls })
          },
          finish_reason: "stop"
        }],
        usage: result.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      return this.errorResponse("Chat completion failed", 500, (error as Error).message);
    }
  },

  // Helper functions
  mapTools(tools: Assistant['tools']) {
    return tools.map(tool => {
      if (tool.type === 'code_interpreter') {
        return {
          type: "function",
          function: {
            name: "code_interpreter",
            description: "Executes Python code",
            parameters: {
              type: "object",
              properties: {
                code: { type: "string", description: "Python code to execute" }
              },
              required: ["code"]
            }
          }
        };
      }
      return tool;
    });
  },

  errorResponse(message: string, status: number, details?: string) {
    return new Response(JSON.stringify({
      error: {
        message,
        type: "api_error",
        ...(details && { details })
      }
    }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
