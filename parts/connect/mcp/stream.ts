import { methods } from './standard.ts'

/** A kept stream of `/mcp`, as the standard writes one: its answer, and what is sent down it. */
export interface McpStream {
  response: Response
  // The note that the list of tools changed, which a client then asks for again.
  changed(): void
  // A request of the standard to the client, which the client answers by a request of its own with the same id.
  ask(id: string, method: string, params: object): void
  // A sign of life, which tells the client and every proxy between that the stream is still open.
  alive(): void
  close(): void
}

const encoder = new TextEncoder()

// The most bytes that may wait for a client to read them.
const waitingMost = 1_048_576

/**
 * Makes a kept stream: an answer of events, each a message of the standard as JSON. `ended` is told once when
 * the stream is closed, by the client, by `close`, or where more than 1 MB waits for the client to read it.
 */
export function mcpStream(ended: () => void): McpStream {
  let control: ReadableStreamDefaultController<Uint8Array> | undefined
  let open = true
  const end = (): void => {
    if (!open) return
    open = false
    ended()
  }
  const body = new ReadableStream<Uint8Array>(
    {
      start(made) {
        control = made
      },
      cancel: end,
    },
    new ByteLengthQueuingStrategy({ highWaterMark: waitingMost }),
  )
  const send = (text: string): void => {
    if (!open || !control) return
    try {
      control.enqueue(encoder.encode(text))
    } catch {
      end()
      return
    }
    // A client that reads nothing would have the engine hold all that is sent it: past 1 MB its stream is closed,
    // and what waits is dropped with it, so that it is held no longer.
    if ((control.desiredSize ?? 0) < 0) {
      control.error(new Error('The client of MCP read nothing of its stream.'))
      end()
    }
  }
  const message = (value: object): void => send(`event: message\ndata: ${JSON.stringify(value)}\n\n`)
  return {
    response: new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' },
    }),
    changed: () => message({ jsonrpc: '2.0', method: methods.changed }),
    ask: (id, method, params) => message({ jsonrpc: '2.0', id, method, params }),
    alive: () => send(': alive\n\n'),
    close() {
      if (!open) return
      try {
        control?.close()
      } catch {
        // A stream that the client closed first cannot be closed again.
      }
      end()
    },
  }
}
