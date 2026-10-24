import assert from 'node:assert/strict'
import test from 'node:test'
import { TentError } from '../../core/index.ts'
import { mcpClient } from '../mcp/client.ts'

/**
 * A server of the older form whose tool `confirm` asks the person a question with yes and no down the stream of
 * the call, and answers the call there once it is answered. Answers what sends a request to it, and what it heard.
 */
function olderServer() {
  const heard: Record<string, unknown>[] = []
  let open: { stream: ReadableStreamDefaultController<Uint8Array>; call: unknown } | undefined
  const event = (message: object): Uint8Array => new TextEncoder().encode(`data: ${JSON.stringify(message)}\n\n`)
  let asked = 0
  const fetch = async (request: Request): Promise<Response> => {
    const body: Record<string, unknown> = Object(await request.json())
    heard.push(body)
    if (body.method === 'initialize')
      return Response.json(
        { jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-11-25', capabilities: {} } },
        { headers: { 'mcp-session-id': 's1' } },
      )
    if (body.method === undefined && body.result !== undefined) {
      // The answer of the person reaches the server, which answers the call down its stream.
      open?.stream.enqueue(
        event({ jsonrpc: '2.0', id: open.call, result: { content: [{ type: 'text', text: 'done' }] } }),
      )
      open?.stream.close()
      return new Response(null, { status: 202 })
    }
    if (body.method !== 'tools/call') return new Response(null, { status: 202 })
    asked++
    const call = body.id
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        open = { stream: controller, call }
        controller.enqueue(
          event({
            jsonrpc: '2.0',
            id: `q${asked}`,
            method: 'elicitation/create',
            params: { message: 'Close the month?', requestedSchema: { type: 'object', properties: {} } },
          }),
        )
      },
    })
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
  }
  return { fetch, heard, asked: () => asked }
}

test('[25-11] a question of a server of the older form that the person answers after the call it held is gone goes back to the server, and is not asked again', async () => {
  const server = olderServer()
  const client = mcpClient({
    url: 'https://docs.test/mcp',
    fetch: server.fetch,
    timeout: 20,
    size: 1_048_576,
    form: { get: () => 'older', set: () => undefined },
  })
  const signal = new AbortController().signal
  const first = await client.call('confirm', {}, signal).then(
    () => undefined,
    (error: unknown) => error,
  )
  assert.ok(first instanceof TentError && first.fields?.question === 'Close the month?', String(first))
  const state = String(first.fields?.state)
  // The person answers later than the call is held.
  await new Promise((done) => setTimeout(done, 60))
  const result = await client.call('confirm', {}, signal, { state, response: { action: 'accept' } })
  assert.deepEqual(result.content, [{ type: 'text', text: 'done' }])
  assert.equal(server.asked(), 2, 'the call is made anew once')
  const replies = server.heard.filter((one) => one.method === undefined && one.result !== undefined)
  assert.deepEqual(
    replies.map((one) => [one.id, one.result]),
    [['q2', { action: 'accept' }]],
  )
})
