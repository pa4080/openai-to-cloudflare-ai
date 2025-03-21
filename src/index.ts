import { textGenerationModels } from "./models";
let globalModels: ModelType[] = [];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    console.log(url.pathname);

    // Authorization check
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ') || authHeader.split(' ')[1] !== env.API_KEY) {



      switch (true) {
        case url.pathname === '/models/search' && request.method === 'GET':
          return this.displayModelsInfo(env, request);
        default:
          return this.errorResponse("Unauthorized", 401);
      }
    }

    switch (true) {
      case url.pathname === '/v1/models' && request.method === 'GET':
        return this.handleListModels(env);
      case url.pathname === '/v1/chat/completions' && request.method === 'POST':
        return this.handleChatCompletions(request, env);
      case url.pathname === '/v1/embeddings' && request.method === 'POST':
        return this.handleEmbeddings(request, env);
      case url.pathname.startsWith('/v1/assistants'):
        return this.handleAssistants(request, env, url);
      case url.pathname.startsWith('/v1/threads'):
        return this.handleThreads(request, env, url);
      default:
        return this.errorResponse("Not found", 404);
    }
  },

  async handleListModels(env: Env) {
    const models = await this.listAIModels(env);

    return new Response(JSON.stringify({
      object: "list",
      data: models
    }), { headers: { 'Content-Type': 'application/json' } });
  },

  async handleChatCompletions(request: Request, env: Env) {
    try {
      const data = await request.json() as OpenAiChatCompletionReq;
      console.log(data.model);
      const { model, options } = this.transformChatCompletionRequest(data, env);
      console.log("Model in use:", model, 'Stream', options?.stream); // Log the model in use

      const aiRes = await env.AI.run(model, options);

      if (options.stream && aiRes instanceof ReadableStream) {
        return await this.chatStreamResponse(aiRes, model);
      }

      if (!options.stream && 'response' in aiRes && !!aiRes.response) {
        return this.chatNormalResponse(aiRes, model);
      }

      throw new Error("None of the responses are valid");
    } catch (error) {
      return this.errorResponse("Chat completion failed", 500, (error as Error).message);
    }
  },

  async handleEmbeddings(request: Request, env: Env): Promise<Response> {
    try {
      const data = await request.json() as OpenAiEmbeddingReq;
      const { model: requestedModel, input, encoding_format } = data;
      const model = this.getCfModelName(requestedModel, env);


      // Validation
      if (!model || !input) {
        return this.errorResponse("Model and input are required", 400);
      }

      // Check if valid embedding model
      const models = await this.listAIModels(env);
      const modelInfo = models.find(m =>
        m.name === model && m.taskName === 'Text Embeddings'
      );
      if (!modelInfo) {
        return this.errorResponse("Invalid embedding model", 400);
      }

      // Convert OpenAI-style input to Cloudflare's text format
      const texts = Array.isArray(input) ? input : [input];
      if (texts.some(t => typeof t !== 'string' || t.length === 0)) {
        return this.errorResponse("Invalid input format", 400);
      }

      // Create Cloudflare AI options
      const options: AiEmbeddingInputOptions = { text: texts };

      // Get embeddings from Cloudflare AI
      const aiRes = await env.AI.run(model, options);

      if (!('data' in aiRes) || !aiRes?.data || !Array.isArray(aiRes.data)) {
        return this.errorResponse("Failed to generate embeddings", 500);
      }

      // Convert to OpenAI format
      const embeddings: OpenAiEmbeddingObject[] = aiRes.data.map((vector, index) => ({
        object: 'embedding',
        index,
        embedding: encoding_format === 'base64'
          ? this.floatArrayToBase64(vector)
          : vector
      }));

      // Estimate token usage (approximate)
      const promptTokens = texts.join(' ').split(/\s+/).length;

      return new Response(JSON.stringify({
        object: 'list',
        data: embeddings,
        model: model, // Cloudflare AI model, also we can return 'requestedModel' as it was requested?
        usage: {
          prompt_tokens: promptTokens,
          total_tokens: promptTokens
        }
      } as OpenAiEmbeddingRes), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      return this.errorResponse("Embedding failed", 500, (error as Error).message);
    }
  },

  async handleAssistants(request: Request, env: Env, url: URL) {
    try {
      if (url.pathname.endsWith('/assistants')) {
        switch (request.method) {
          case 'POST':
            return this.createAssistant(request, env);
          case 'GET':
            return this.listAssistants(env);
          default:
            return this.errorResponse("Method not allowed", 405);
        }
      }

      const assistantId = url.pathname.split('/').pop() || '';
      assistantId && this.testAssistantId(assistantId);

      switch (request.method) {
        case 'GET':
          return this.retrieveAssistant(env, assistantId);
        case 'POST':
          return this.modifyAssistant(request, env, assistantId);
        case 'DELETE':
          return this.deleteAssistant(env, assistantId);
        default:
          return this.errorResponse("Method not allowed", 405);
      }
    } catch (error) {
      return this.errorResponse("Assistant operation failed", 500, (error as Error).message);
    }
  },

  async handleThreads(request: Request, env: Env, url: URL) {
    try {
      if (url.pathname.endsWith('/runs')) {
        const threadId = url.pathname.split('/').at(-2) || '';
        this.testThreadId(threadId);
        return this.handleThreadRuns(request, env, threadId);
      }

      if (url.pathname.endsWith('/threads')) {
        switch (request.method) {
          case 'POST':
            return this.createThread(request, env);
          case 'GET':
            return this.listThreads(env);
          default:
            return this.errorResponse("Method not allowed", 405);
        }
      }

      const threadId = url.pathname.split('/').pop() || '';
      this.testThreadId(threadId);

      switch (request.method) {
        case 'GET':
          return this.retrieveThread(env, threadId);
        case 'POST':
          return this.modifyThread(request, env, threadId);
        case 'DELETE':
          return this.deleteThread(env, threadId);
        default:
          return this.errorResponse("Method not allowed", 405);
      }
    } catch (error) {
      return this.errorResponse("Thread operation failed", 500, (error as Error).message);
    }
  },

  /**
   *  Chat Completion Method
   */
  async chatStreamResponse(responseStream: AiStreamResponse, model: Model) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const timestamp = Date.now();
    const system_fingerprint = `fp_${this.getRandomId()}`;
    const completionId = `chatcmpl-${timestamp}`;
    let index = 0;

    const stream = new ReadableStream({
      async start(controller) {
        const reader = responseStream.getReader();

        // Metadata for response
        const metadata = {
          id: completionId,
          object: "chat.completion.chunk",
          created: Math.floor(timestamp / 1000),
          model,
          service_tier: "default",
          system_fingerprint,
        };

        // Send initial empty delta
        controller.enqueue(
          encoder.encode(
            'data: ' + JSON.stringify({
              ...metadata,
              choices: [{ index: index, delta: { role: "assistant", content: "", refusal: null }, logprobs: null, finish_reason: null }]
            }) + "\n\n"
          )
        );

        let done = false;
        while (!done) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split(/\r?\n\n/).filter(line => line.trim() !== "");

          for (const line of lines) {
            if (line === "data: [DONE]") {
              done = true;
              break;
            }

            if (line.startsWith("data: ")) {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.response) {
                  controller.enqueue(
                    encoder.encode(
                      'data: ' + JSON.stringify({
                        ...metadata,
                        id: completionId,
                        choices: [{ index: index, delta: { content: parsed.response }, logprobs: null, finish_reason: null }]
                      }) + "\n\n"
                    )
                  );
                }
                if (parsed.usage) {
                  done = true;
                  break;
                }
              } catch (err) {
                console.error("Error parsing JSON:", err);
              }
            }
          }
        }

        // Send final message with finish_reason
        controller.enqueue(
          encoder.encode(
            'data: ' + JSON.stringify({
              ...metadata,
              id: completionId,
              choices: [{ index: index, delta: {}, logprobs: null, finish_reason: "stop" }]
            }) + "\n\ndata: [DONE]\n\n"
          )
        );

        controller.close();
      }
    });


    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  },

  chatNormalResponse(result: AiJsonResponse, model: string) {
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

  transformChatCompletionRequest(request: OpenAiChatCompletionReq, env: Env): AiChatRequestParts {
    // Base options common to both prompt and messages formats
    const baseOptions: AiBaseInputOptions = {
      stream: request.stream ?? undefined,
      max_tokens: request.max_completion_tokens ?? request.max_tokens ?? undefined,
      temperature: this.mapTemperatureToCloudflare(request?.temperature ?? undefined),
      top_p: request.top_p ?? undefined,
      seed: request.seed ?? undefined,
      repetition_penalty: undefined, // Not directly mapped
      frequency_penalty: request.frequency_penalty ?? undefined,
      presence_penalty: request.presence_penalty ?? undefined
    };

    if (request.tools) {
      console.log(JSON.stringify(request.tools));
    }

    const mappedTools = this.mapTools(request.tools);

    // Always use messages interface since we're working with chat completions
    const options: AiMessagesInputOptions = {
      ...baseOptions,
      messages: request.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      tools: mappedTools,
      // Map deprecated function_call to tool_choice
      ...(request.tool_choice ? { tool_choice: request.tool_choice } :
        request.function_call ? { tool_choice: request.function_call } : {})
    };

    // Handle response format constraints
    if (typeof request.response_format === 'object' && 'type' in request.response_format
      && request.response_format?.type === 'json_object') {
      options.messages = [
        ...options.messages,
        {
          role: 'system',
          content: 'Respond using JSON format'
        }
      ];
    }

    return {
      model: this.getCfModelName(request?.model, env),
      options: options
    };
  },

  /**
   * Assistant methods
   */
  async createAssistant(request: Request, env: Env) {
    const data = await request.json() as Partial<Assistant>;

    // Validation
    if (!data.model) return this.errorResponse("Model is required", 400);
    if (data.name && data.name.length > 256) return this.errorResponse("Name exceeds 256 characters", 400);
    if (data.description && data.description.length > 512) return this.errorResponse("Description exceeds 512 characters", 400);

    const model = this.getCfModelName(data.model, env);
    const assistantId = `asst_${this.getRandomId()}`;
    const assistant: Assistant = {
      id: assistantId,
      object: "assistant",
      created_at: Math.floor(Date.now() / 1000),
      name: data.name || null,
      description: data.description || null,
      model: model,
      instructions: data.instructions || null,
      tools: data.tools || [],
      tool_resources: data.tool_resources || {}, // Added tool_resources
      metadata: data.metadata || {},
      temperature: data.temperature,
      top_p: data.top_p,
      response_format: data.response_format || "auto"
    };

    const key = `assistant:${assistantId}`;

    await env.CACHE.put(key, JSON.stringify(assistant));

    return new Response(JSON.stringify(assistant), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  },

  async retrieveAssistant(env: Env, assistantId: string) {
    const key = `assistant:${assistantId}`;
    const assistant = await env.CACHE.get<Assistant>(key, "json");
    return assistant
      ? new Response(JSON.stringify(assistant), { headers: { 'Content-Type': 'application/json' } })
      : this.errorResponse("Assistant not found", 404);
  },

  async modifyAssistant(request: Request, env: Env, assistantId: string) {
    const key = `assistant:${assistantId}`;
    const existingAssistant = await env.CACHE.get<Assistant>(key, "json");
    if (!existingAssistant) {
      return this.errorResponse("Assistant not found", 404);
    }

    const data = await request.json() as Partial<CreateAssistantRequest>;

    // Validate updatable fields
    if (data.name && data.name.length > 256) {
      return this.errorResponse("Name exceeds 256 characters", 400);
    }
    if (data.description && data.description.length > 512) {
      return this.errorResponse("Description exceeds 512 characters", 400);
    }
    if (data.instructions && data.instructions.length > 256000) {
      return this.errorResponse("Instructions exceed 256,000 characters", 400);
    }

    // Validate metadata if present
    if (data.metadata) {
      for (const [key, value] of Object.entries(data.metadata)) {
        if (key.length > 64) {
          return this.errorResponse("Metadata key exceeds 64 characters", 400);
        }
        if (typeof value === 'string' && value.length > 512) {
          return this.errorResponse("Metadata value exceeds 512 characters", 400);
        }
      }
    }

    // Merge updates with existing assistant
    const updatedAssistant: Assistant = {
      ...existingAssistant,
      model: this.getCfModelName(data.model ?? existingAssistant.model, env),
      name: data.name ?? existingAssistant.name,
      description: data.description ?? existingAssistant.description,
      instructions: data.instructions ?? existingAssistant.instructions,
      tools: data.tools ?? existingAssistant.tools,
      tool_resources: data.tool_resources ?? existingAssistant.tool_resources,
      metadata: data.metadata ?? existingAssistant.metadata,
      temperature: data.temperature ?? existingAssistant.temperature,
      top_p: data.top_p ?? existingAssistant.top_p,
      response_format: data.response_format ?? existingAssistant.response_format,
      reasoning_effort: data.reasoning_effort ?? existingAssistant.reasoning_effort
    };

    // Validate tools count
    if (updatedAssistant.tools.length > 128) {
      return this.errorResponse("Too many tools - maximum 128 allowed", 400);
    }

    // Save updated assistant
    await env.CACHE.put(key, JSON.stringify(updatedAssistant));

    return new Response(JSON.stringify(updatedAssistant), {
      headers: { 'Content-Type': 'application/json' }
    });
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

  async deleteAssistant(env: Env, assistantId: string) {
    const key = `assistant:${assistantId}`;
    const assistant = await env.CACHE.get<Assistant>(key, "json");
    if (!assistant) return this.errorResponse("Assistant not found", 404);

    await env.CACHE.delete(key);
    return new Response(JSON.stringify({
      id: assistantId,
      object: "assistant.deleted",
      deleted: true
    }), { headers: { 'Content-Type': 'application/json' } });
  },

  /**
   * Thread methods
   */
  async createThread(request: Request, env: Env) {
    const data = await request.json() as {
      messages?: Array<ChatMessage>;
      tool_resources?: Record<string, any>;
      metadata?: Record<string, any>;
    };

    const thread: Thread = {
      id: `thread_${this.getRandomId()}`,
      object: "thread",
      created_at: Math.floor(Date.now() / 1000),
      metadata: data.metadata || {},
      tool_resources: data.tool_resources || {}
    };

    if (data.messages) {
      await env.CACHE.put(`thread:${thread.id}:messages`, JSON.stringify(data.messages));
    }

    await env.CACHE.put(`thread:${thread.id}`, JSON.stringify(thread));

    return new Response(JSON.stringify(thread), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  },

  async listThreads(env: Env) {
    const list = await env.CACHE.list({ prefix: "thread:" });
    const threads = await Promise.all(
      list.keys.map(async k => await env.CACHE.get<Thread>(k.name, "json"))
    );

    return new Response(JSON.stringify({
      object: "list",
      data: threads.filter(Boolean),
      has_more: false
    }), { headers: { 'Content-Type': 'application/json' } });
  },

  async modifyThread(request: Request, env: Env, threadId: string) {
    const key = `thread:${threadId}`;
    const existingThread = await env.CACHE.get<Thread>(key, "json");
    if (!existingThread) return this.errorResponse("Thread not found", 404);

    // Parse request body
    const data = await request.json() as {
      metadata?: Record<string, string>;
      tool_resources?: Record<string, any>;
    };

    // Validate metadata constraints
    if (data.metadata) {
      for (const [key, value] of Object.entries(data.metadata)) {
        if (key.length > 64) {
          return this.errorResponse("Metadata key exceeds 64 characters", 400);
        }
        if (typeof value === 'string' && value.length > 512) {
          return this.errorResponse("Metadata value exceeds 512 characters", 400);
        }
      }
    }

    // Create updated thread object
    const updatedThread: Thread = {
      ...existingThread,
      metadata: data.metadata ?? existingThread.metadata,
      tool_resources: data.tool_resources ?? existingThread.tool_resources
    };

    // Save to KV storage
    await env.CACHE.put(key, JSON.stringify(updatedThread));

    return new Response(JSON.stringify(updatedThread), {
      headers: { 'Content-Type': 'application/json' }
    });
  },

  async retrieveThread(env: Env, threadId: string) {
    const key = `thread:${threadId}`;
    const thread = await env.CACHE.get<Thread>(key, "json");
    if (!thread) return this.errorResponse("Thread not found", 404);

    // Get thread messages if they exist
    const messages = await env.CACHE.get<ChatMessage[]>(
      `${key}:messages`,
      "json"
    ) || [];

    const response = {
      ...thread,
      messages: messages.map(msg => ({
        id: `msg_${this.getRandomId()}`,
        created_at: Math.floor(Date.now() / 1000),
        ...msg
      }))
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    });
  },

  async deleteThread(env: Env, threadId: string) {
    const key = `thread:${threadId}`;
    const thread = await env.CACHE.get<Thread>(key, "json");
    if (!thread) return this.errorResponse("Thread not found", 404);

    // Delete both thread metadata and messages
    await Promise.all([
      env.CACHE.delete(key),
      env.CACHE.delete(`${key}:messages`)
    ]);

    return new Response(JSON.stringify({
      id: threadId,
      object: "thread.deleted",
      deleted: true
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  },

  async handleThreadRuns(request: Request, env: Env, threadId: string) {
    try {
      if (!threadId && !/^thread/.test(request.url)) return this.errorResponse("Thread ID required", 400);

      const data = await request.json() as ThreadRunRequest;

      // Validate required fields
      if (!data.assistant_id) return this.errorResponse("assistant_id is required", 400);

      const threadCache = await env.CACHE.get<Thread>(`thread:${threadId}`, "json");

      // Create run object
      const run: ThreadRun = {
        ...data,
        id: `run_${this.getRandomId()}`,
        object: "thread.run",
        created_at: Math.floor(Date.now() / 1000),
        thread_id: threadId,
        assistant_id: data.assistant_id,
        status: "queued",
        tool_resources: data?.tool_resources || threadCache?.tool_resources || {},
        model: this.getCfModelName(data.model, env),
        usage: null
      };

      // Store run in KV
      await env.CACHE.put(`run:${run.id}`, JSON.stringify(run));

      // Execute the run
      return this.executeThreadRun(env, run);
    } catch (error) {
      return this.errorResponse("Run creation failed", 500, (error as Error).message);
    }
  },

  async executeThreadRun(env: Env, run: ThreadRun) {
    try {
      // Get assistant
      const assistant = await env.CACHE.get<Assistant>(`assistant:${run.assistant_id}`, "json");
      if (!assistant) return this.errorResponse("Assistant not found", 404);

      // Get thread messages
      const messages = await env.CACHE.get<ChatMessage[]>(
        `thread:${run.thread_id}:messages`, "json"
      ) || [];

      // Transform the request using the new method;
      const { model, options } = this.transformThreadRunRequest(run, assistant, messages, env);

      // Execute AI run with properly typed options
      const aiRes = await env.AI.run(model, options);

      // Update run status
      run.status = "completed";
      run.usage = 'usage' in aiRes ? aiRes.usage : null;
      await env.CACHE.put(`run:${run.id}`, JSON.stringify(run));

      // Handle stream response
      if (run?.stream && aiRes instanceof ReadableStream) {
        return this.chatStreamResponse(aiRes, model);
      }

      // Format standard response
      if (!options.stream && 'response' in aiRes && !!aiRes.response) {
        return this.chatNormalResponse(aiRes, model);
      }

      throw new Error("None of the responses are valid");
    } catch (error) {
      return this.errorResponse("Chat completion failed", 500, (error as Error).message);
    }
  },

  transformThreadRunRequest(
    run: ThreadRun,
    assistant: Assistant,
    messages: ChatMessage[],
    env: Env
  ): AiChatRequestParts {
    // Base options from both run configuration and assistant defaults
    const baseOptions: AiBaseInputOptions = {
      stream: run.stream ?? undefined,
      max_tokens: run.max_completion_tokens ?? undefined,
      temperature: this.mapTemperatureToCloudflare(
        run.temperature ?? assistant.temperature ?? undefined
      ),
      top_p: run.top_p ?? assistant.top_p,
      seed: run.truncation_strategy?.last_messages ?? undefined,
      frequency_penalty: undefined, // Not directly mapped
      presence_penalty: undefined,   // Not directly mapped
    };

    // Map assistant tools to AI-compatible format
    const mappedTools = this.mapTools(assistant.tools);

    // Handle response format constraints
    const systemMessages = typeof assistant.response_format === 'object' && 'type' in assistant.response_format
      && assistant.response_format?.type === 'json_object' ? [{
        role: 'system' as ChatMessageRole,
        content: 'Respond using JSON format'
      }] : [];

    const options: AiMessagesInputOptions = {
      ...baseOptions,
      messages: [
        ...systemMessages,
        ...messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ],
      tools: mappedTools,
    };

    return {
      model: this.getCfModelName(assistant.model, env),
      options: options
    };
  },

  /**
   * Helper functions
   */
  mapTools(tools: Assistant['tools'] | undefined): Array<Tool | FunctionTool> | undefined {
    if (!tools) return tools;

    console.log("tools", tools);

    return tools.map(tool => {
      switch (tool.type) {
        case 'code_interpreter':
          return {
            type: "function",
            function: {
              name: "code_interpreter",
              description: "Executes Python code",
              parameters: {
                type: "object",
                properties: { code: { type: "string", description: "Python code to execute" } },
                required: ["code"]
              }
            }
          };
        case 'file_search':
          return {
            type: "function",
            function: {
              name: "file_search",
              description: "Searches through files",
              parameters: {
                type: "object",
                properties: { query: { type: "string", description: "Query to search for" } },
                required: ["query"]
              }
            }
          };
        default:
          return {
            type: "function",
            function: {
              name: tool.function.name,
              description: tool.function.description || "",
              parameters: tool.function.parameters
            }
          };
      }
    });
  },

  errorResponse(message: string, status: number, details?: string) {
    return new Response(JSON.stringify({
      error: { message, type: "api_error", ...(details && { details }) }
    }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  },

  mapTemperatureToCloudflare(temp: number | null | undefined): number {
    /**
     * Maps OpenAI temperature (0-2) to Cloudflare AI temperature (0-5)
     * @param openaiTemp OpenAI-style temperature (0-2)[1]
     * @returns Cloudflare-optimized temperature (0-5)[0.6]
     */
    // Clamp to OpenAI's valid range
    const openaiTemp = temp ?? 1;
    const clamped = Math.min(Math.max(openaiTemp, 0), 2);
    // Linear mapping: 0→0, 1→2.5, 2→5
    return !!temp ? Number(temp) === 1 ? 0.6 : Number((clamped * 2.5).toFixed(1)) : 0.6;
  },

  floatArrayToBase64(vector: number[]): string {
    const float32 = new Float32Array(vector);
    const uint8 = new Uint8Array(float32.buffer);
    return btoa(String.fromCharCode(...uint8));
  },

  getRandomId() {
    return crypto.randomUUID().split('-')[0];
  },

  testAssistantId(assistantId: string | undefined) {
    if (!assistantId || !/^asst/.test(assistantId)) return this.errorResponse("Invalid Assistant ID", 400);
  },

  testThreadId(threadId: string | undefined) {
    if (!threadId || !/^thread/.test(threadId)) return this.errorResponse("Invalid Thread ID", 400);
  },

  async listAIModels(env: Env) {
    if (globalModels.length > 0) return globalModels;

    globalModels = textGenerationModels;
    if (!env?.CF_ACCOUNT_ID || !env?.CF_API_KEY) return globalModels;

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/models/search`,
      {
        method: 'GET', headers: { Authorization: `Bearer ${env.CF_API_KEY}` }
      });

    if (!response.ok) return globalModels;

    const data = await response.json() as FetchModelsResponse;
    const modelTypesInUse = [
      "Text Generation",
      "Text Embeddings",
      "Translation",
      "Text Classification",
      "Summarization"
    ];

    const models: ModelType[] = data
      .result
      .map((model) => ({
        id: `${model.name}#${model.task.name.toLocaleLowerCase().replace(' ', '-')}`,
        name: model.name,
        object: 'model',
        description: model.description,
        taskName: model.task.name,
        taskDescription: model.task.description,
        inUse: modelTypesInUse.includes(model.task.name)
      }));

    globalModels = models;

    return globalModels;
  },

  /**
   * We decide to tag the model type in the Id, i.e: @cf/google/gemma-2b-it-lora#text-generation
   * So from this function we return the model name which must bne used wit the AI embedding.
   */
  getCfModelName(modelId: string | undefined, env: Env) {
    return modelId?.replace(/#.*$/, '') || env.DEFAULT_AI_MODEL;
  },

  async displayModelsInfo(env: Env, request: Request) {
    const models = await this.listAIModels(env);
    const searchParams = new URL(request.url).searchParams;
    const query = searchParams.get('query');

    if (query && query === 'json') {
      return new Response(
        JSON.stringify({ data: models }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    const html = `
      <style>
        table { padding: 1rem; font-family: sans; }
        th, td { border: 1px solid gray; padding: 0.5rem; }
        td { vertical-align: top; }
        cose, pre: { font-family: monospace; }
      </style>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Id (Name)</th>
            <th>Task Name</th>
            <th>In use</th>
            <th>Description</th>
          </tr>
        <thead>
        <tbody>
        ${models.sort((a, b) => a.taskName.localeCompare(b.taskName)).map((model, index) => `
          <tr>
            <td>${index + 1}</td>
            <td><pre><b style="font-size: 1.05rem;">${model.id}</b></pre></td>
            <td>${model.taskName}</td>
            <td style="text-align: center;">${model.inUse ? "<b>Yes</b>" : "No"}</td>
            <td>
              <p><b>Model:</b> ${model.description}</p>
              <p><b>Task:</b> ${model.taskDescription}</p>
            </td>
          </tr>
        `).join('')}
        </tbody>
      </table>
    `;

    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
  },

};
