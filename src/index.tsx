export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Authorization check
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ') || authHeader.split(' ')[1] !== env.API_KEY) {
      return this.errorResponse("Unauthorized", 401);
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
      data: models
    }), { headers: { 'Content-Type': 'application/json' } });
  },

  async handleAssistants(request: Request, env: Env, url: URL) {
    try {
      const assistantId = url.pathname.split('/').pop() || '';
      const key = `assistant:${assistantId}`;

      switch (request.method) {
        case 'POST':
          return this.createAssistant(request, env, key);
        case 'GET':
          return assistantId
            ? this.getAssistant(env, key)
            : this.listAssistants(env);
        case 'DELETE':
          return this.deleteAssistant(env, key, assistantId);
        default:
          return this.errorResponse("Method not allowed", 405);
      }
    } catch (error) {
      return this.errorResponse("Assistant operation failed", 500, (error as Error).message);
    }
  },

  async createAssistant(request: Request, env: Env, key: string) {
    const data = await request.json() as Partial<Assistant>;

    // Validation
    if (!data.model) return this.errorResponse("Model is required", 400);
    if (data.name && data.name?.length > 256) return this.errorResponse("Name exceeds 256 characters", 400);
    if (data.description && data.description?.length > 512) return this.errorResponse("Description exceeds 512 characters", 400);

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
      expirationTtl: 60 * 60 * 24 * 365 * 2 // 2 years
    });

    return new Response(JSON.stringify(assistant), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  },

  async getAssistant(env: Env, key: string) {
    const assistant = await env.CACHE.get<Assistant>(key, "json");
    return assistant
      ? new Response(JSON.stringify(assistant), { headers: { 'Content-Type': 'application/json' } })
      : this.errorResponse("Assistant not found", 404);
  },

  async listAssistants(env: Env) {
    const list = await env.CACHE.list({ prefix: "assistant:" });
    const assistants = await Promise.all(
      list.keys.map(async k => await env.CACHE.get<Assistant>(k.name, "json"))
    );

    return new Response(JSON.stringify({
      object: "list",
      data: assistants.filter(Boolean),
      has_more: false
    }), { headers: { 'Content-Type': 'application/json' } });
  },

  async deleteAssistant(env: Env, key: string, assistantId: string) {
    await env.CACHE.delete(key);
    return new Response(JSON.stringify({
      id: assistantId,
      object: "assistant.deleted",
      deleted: true
    }), { headers: { 'Content-Type': 'application/json' } });
  },

  async handleChatCompletions(request: Request, env: Env) {
    try {
      const data = await request.json() as OpenAiChatCmplReq;
      const { model: reqModel, options } = this.transformRequest(data);
      const model = reqModel || env.DEFAULT_AI_MODEL;
      console.log("Model in use", model); // Log the model in use

      // Run the AI inference
      const response = await env.AI.run({ model: model, options });

      // Handle streaming response
      if (options.stream && 'format' in response && !!response.format) {
        return this.handleStreamResponse(response, model);
      }

      // Format standard response
      if (!options.stream && 'response' in response && !!response.response) {
        return this.formatCompletion(response, model);
      }

      throw new Error("None of the responses are valid");
    } catch (error) {
      return this.errorResponse("Chat completion failed", 500, (error as Error).message);
    }
  },

  handleStreamResponse(result: AiStreamResponse, model: string): Response {
    // Generate consistent ID and timestamp for all chunks
    const id = `chatcmpl-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    const systemFingerprint = "fp_" + crypto.randomUUID().slice(0, 8);

    // Create transform stream to format SSE events
    const transformer = new TransformStream<Uint8Array, Uint8Array>({
      start(controller) {
        // Send initial chunk with assistant role
        const initialChunk = JSON.stringify({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          system_fingerprint: systemFingerprint,
          choices: [{
            index: 0,
            delta: { role: "assistant", content: "" },
            logprobs: null,
            finish_reason: null
          }]
        });
        controller.enqueue(new TextEncoder().encode(`data: ${initialChunk}\n\n`));
      },
      transform(chunk: Uint8Array, controller) {
        // Decode the Cloudflare AI chunk
        const content = new TextDecoder().decode(chunk);

        // Format as OpenAI-compatible SSE chunk
        const dataChunk = JSON.stringify({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          system_fingerprint: systemFingerprint,
          choices: [{
            index: 0,
            delta: { content },
            logprobs: null,
            finish_reason: null
          }]
        });

        controller.enqueue(new TextEncoder().encode(`data: ${dataChunk}\n\n`));
      },
      flush(controller) {
        // Send final chunk with stop reason
        const finalChunk = JSON.stringify({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          system_fingerprint: systemFingerprint,
          choices: [{
            index: 0,
            delta: {},
            logprobs: null,
            finish_reason: "stop"
          }]
        });
        controller.enqueue(new TextEncoder().encode(`data: ${finalChunk}\n\n`));
      }
    });

    // Pipe the Cloudflare AI stream through our transformer
    const readableStream = result.format.pipeThrough(transformer);

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  },

  formatCompletion(result: AiJsonResponse, model: string) {
    const response = {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [{
        message: {
          content: result.response,
          role: "assistant",
          ...(result.tool_calls && { tool_calls: result.tool_calls })
        },
        finish_reason: "stop"
      }],
      usage: result.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    });
  },

  // Helper functions
  normalizeTool(tool: Assistant['tools'][number]) {
    if (tool.type === 'code_interpreter') {
      return {
        type: "code_interpreter",
        function: {
          name: "code_interpreter",
          description: "Executes Python code",
          parameters: {
            type: "object",
            properties: { code: { type: "string" } },
            required: ["code"]
          }
        }
      };
    }
    return { ...tool, type: tool.type as "function" | "code_interpreter" | "file_search" };
  },

  mapTools(tools: Assistant['tools']) {
    return tools.map(tool => ({
      type: "function",
      function: {
        name: tool.type === 'function' ? tool.function.name : tool.type,
        description: tool.type === 'function' ? tool.function.description : "",
        parameters: tool.type === 'function' ? tool.function.parameters : {}
      }
    }));
  },


  errorResponse(message: string, status: number, details?: string) {
    return new Response(JSON.stringify({
      error: { message, type: "api_error", ...(details && { details }) }
    }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  },

  transformRequest(request: OpenAiChatCmplReq): CloudflareAiRequest {
    // Base options common to both prompt and messages formats
    const baseOptions: BaseInputOptions = {
      stream: request.stream ?? undefined,
      max_tokens: request.max_completion_tokens ?? request.max_tokens ?? undefined,
      temperature: request.temperature ?? undefined,
      top_p: request.top_p ?? undefined,
      seed: request.seed ?? undefined,
      repetition_penalty: undefined, // Not directly mapped
      frequency_penalty: request.frequency_penalty ?? undefined,
      presence_penalty: request.presence_penalty ?? undefined
    };

    // Handle tools conversion
    const tools = (request.tools || request.functions)?.map(tool => {
      if ('function' in tool) { // Handle OpenAI-style tools
        return {
          type: 'function',
          function: {
            name: tool.function.name,
            description: tool.function.description || '',
            parameters: tool.function.parameters
          }
        } as FunctionTool;
      }
      return tool as Tool;
    });

    // Always use messages interface since we're working with chat completions
    const options: MessagesInputOptions = {
      ...baseOptions,
      messages: request.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      tools: tools ?? undefined,
      // Map deprecated function_call to tool_choice
      ...(request.tool_choice ? { tool_choice: request.tool_choice } :
        request.function_call ? { tool_choice: request.function_call } : {})
    };

    // Handle response format constraints
    if (request.response_format?.type === 'json_object') {
      options.messages = [
        ...options.messages,
        {
          role: 'system',
          content: 'Respond using JSON format'
        }
      ];
    }

    return {
      model: request.model,
      options: options
    };
  }
};
