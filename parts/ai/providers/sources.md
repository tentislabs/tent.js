# What the shipped providers are built against

Each provider is built against the provider's own published reference, as `docs/build/26-models.md`, section 3, asks. This file names, for each, the pages, the date they were written down here, and the fields that the code reads for "refused" and "cut off". They were written with no network, from the published references as they stood on 2026-10-15, and are to be held against the pages themselves by whoever runs the providers with real keys, and again at each release.

## anthropic - the Messages API

- Address: `https://api.anthropic.com/v1/messages` (`url` of the model takes the place of `https://api.anthropic.com/v1`). Headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`.
- Pages: https://docs.anthropic.com/en/api/messages, https://docs.anthropic.com/en/api/messages-streaming, https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching, https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking, https://docs.anthropic.com/en/api/errors. Written down on 2026-10-15.
- Body: `model`, `max_tokens` (8192 unless `options` says otherwise), `system` as one text block, `messages` in turns of `user` and `agent` with blocks `text`, `image` (`source: { type: 'base64', media_type, data }`), `tool_use` and `tool_result` (`is_error` for a failure), `tools` with `input_schema`, `stream: true`. What `options` holds is merged into the body.
- A kept start: `cache_control: { type: 'ephemeral' }` on the system block, on the last tool and on the last block of the last message, unless `options: { cache: false }`.
- A typed answer: one tool named `answer` with the shape as its `input_schema`, and `tool_choice: { type: 'tool', name: 'answer' }`; its `input_json_delta` parts are the JSON text of the answer.
- Stream events: `message_start` (`message.usage`: `input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`), `content_block_start`, `content_block_delta` (`text_delta`, `input_json_delta`, `thinking_delta`, `signature_delta`), `message_delta` (`delta.stop_reason`, `usage.output_tokens`), `error`.
- `tokensIn` is `input_tokens` with both counts of a kept start added, which the API reports apart; `tokensCached` is `cache_read_input_tokens` and `tokensStored` is `cache_creation_input_tokens`.
- Refused: `stop_reason: 'refusal'`. Cut off: `stop_reason: 'max_tokens'`. Too busy: status 429 and 529, and an `error` event of the type `overloaded_error` or `rate_limit_error`.
- Reasoning: the `thinking` blocks, where `options` turns thinking on. They and `redacted_thinking` blocks are handed back as they came, with their signatures, in `keep`.

## openai - the responses API

- Address: `https://api.openai.com/v1/responses`, `/embeddings`, `/audio/transcriptions`, `/audio/speech` (`url` of the model takes the place of `https://api.openai.com/v1`). Header `authorization: Bearer <key>`.
- Pages: https://platform.openai.com/docs/api-reference/responses, https://platform.openai.com/docs/api-reference/responses-streaming, https://platform.openai.com/docs/guides/structured-outputs, https://platform.openai.com/docs/guides/reasoning, https://platform.openai.com/docs/api-reference/embeddings, https://platform.openai.com/docs/api-reference/audio. Written down on 2026-10-15.
- Body: `model`, `instructions`, `input` of `{ role, content: [{ type: 'input_text' | 'output_text' | 'input_image' }] }`, `function_call` and `function_call_output` entries, `tools` of `{ type: 'function', name, description, parameters, strict: false }`, `store: false`, `stream: true`. A typed answer is `text: { format: { type: 'json_schema', name: 'answer', schema, strict: false } }`. A model whose `options` states `reasoning` is also asked for `include: ['reasoning.encrypted_content']`.
- Stream events: `response.output_text.delta`, `response.reasoning_summary_text.delta` (the reasoning), `response.refusal.delta`, `response.completed`, `response.incomplete`, `response.failed`, `error`. The calls and the reasoning are read from `response.output` of the end.
- Units: `usage.input_tokens`, `usage.output_tokens`, `usage.input_tokens_details.cached_tokens` (`tokensCached`, a part of `tokensIn`). The server keeps a start by itself; no mark is sent.
- Refused: a `refusal` content part, or `incomplete_details.reason: 'content_filter'`. Cut off: `status: 'incomplete'` for any other reason (`max_output_tokens`).
- Kept: the `reasoning` items of the output, handed back as they came.
- Embeddings: `{ model, input: [texts] }`, answered `data: [{ index, embedding }]` and `usage.prompt_tokens`.
- Hearing: a form with `file`, `model`, `response_format` (`verbose_json` for `whisper-1`, which gives `language` and `duration`; `json` for the others), `language`, `prompt`.
- Speech: `{ model, input, voice, response_format, speed }`, answered with the bytes of the sound.

## openai-style - the chat completions of the older format

- Address: `<url of the model>/chat/completions`, `/embeddings`, `/audio/transcriptions`, `/audio/speech`. A model of this provider states its `url`; a key is sent as `authorization: Bearer <key>` where the model states one.
- Pages: https://platform.openai.com/docs/api-reference/chat/create, https://platform.openai.com/docs/api-reference/chat-streaming, and the pages of the open-model servers that speak it (vLLM, Ollama, llama.cpp): https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html, https://github.com/ollama/ollama/blob/main/docs/openai.md. Written down on 2026-10-15.
- Body: `model`, `messages` with `system`, `user`, `agent` (with `tool_calls`) and `tool` (with `tool_call_id`), an image as `{ type: 'image_url', image_url: { url: 'data:...' } }`, `tools` of `{ type: 'function', function: { name, description, parameters } }`, `stream: true`, `stream_options: { include_usage: true }`. A typed answer is `response_format: { type: 'json_schema', json_schema: { name: 'answer', schema } }`.
- Stream: `data:` lines of `choices[].delta` (`content`, `reasoning_content` as the reasoning, `refusal`, `tool_calls` by `index`), `finish_reason`, and a last line of `usage`, then `data: [DONE]`.
- Units: `usage.prompt_tokens`, `usage.completion_tokens`, `usage.prompt_tokens_details.cached_tokens`.
- Refused: `delta.refusal`, or `finish_reason: 'content_filter'`. Cut off: `finish_reason: 'length'`.

## google - the API of Gemini

- Address: `https://generativelanguage.googleapis.com/v1beta/models/<name>:streamGenerateContent?alt=sse` and `:batchEmbedContents` (`url` of the model takes the place of the part before `/models`). Header `x-goog-api-key`.
- Pages: https://ai.google.dev/api/generate-content, https://ai.google.dev/gemini-api/docs/function-calling, https://ai.google.dev/gemini-api/docs/structured-output, https://ai.google.dev/gemini-api/docs/thinking, https://ai.google.dev/api/embeddings, https://ai.google.dev/gemini-api/docs/troubleshooting. Written down on 2026-10-15.
- Body: `systemInstruction`, `contents` in turns of `user` and `model` with parts `text`, `inlineData`, `functionCall` and `functionResponse` (with the name of the call it answers), `tools: [{ functionDeclarations }]`. A typed answer is `generationConfig: { responseMimeType: 'application/json', responseJsonSchema }`.
- Stream: each event is a `GenerateContentResponse`: `candidates[].content.parts` (a part with `thought: true` is a note), `finishReason`, `usageMetadata`, `promptFeedback.blockReason`.
- Units: `usageMetadata.promptTokenCount`, `candidatesTokenCount` with `thoughtsTokenCount` as `tokensOut`, `cachedContentTokenCount` as `tokensCached`.
- Refused: a `blockReason`, or `finishReason` of `SAFETY`, `PROHIBITED_CONTENT`, `BLOCKLIST`, `SPII`, `RECITATION` or `IMAGE_SAFETY`. Cut off: `finishReason: 'MAX_TOKENS'`. Too busy: status 429 and 503.
- Kept: where a part carries a `thoughtSignature`, every part of the answer, handed back as it came.
- Embeddings: `requests: [{ model: 'models/<name>', content: { parts: [{ text }] } }]`, answered `embeddings: [{ values }]`.

## The provider's own tools

Written down on 2026-10-16, with no network, from the published references as the builder knew them, to be held against the pages themselves as the rest of this file is.

- anthropic: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool, https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-fetch-tool, https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/code-execution-tool. Each stands in `tools` in its own form: `{ type: 'web_search_20250305', name: 'web_search' }`, `{ type: 'web_fetch_20250910', name: 'web_fetch' }`, `{ type: 'code_execution_20250825', name: 'code_execution' }`. The answer holds `server_tool_use` blocks and a `*_tool_result` block for each, which are handed back as they came; `usage.server_tool_use.web_search_requests` is the count of searches, `webSearches`.
- openai: https://platform.openai.com/docs/guides/tools-web-search, https://platform.openai.com/docs/guides/tools-code-interpreter. `{ type: 'web_search' }` and `{ type: 'code_interpreter', container: { type: 'auto' } }` in `tools`; the output holds `web_search_call` and `code_interpreter_call` items, handed back as they came, and each `web_search_call` counts one of `webSearches`.
- google: https://ai.google.dev/gemini-api/docs/google-search, https://ai.google.dev/gemini-api/docs/url-context, https://ai.google.dev/gemini-api/docs/code-execution. `{ google_search: {} }`, `{ url_context: {} }` and `{ code_execution: {} }` in `tools`, beside `functionDeclarations`.
