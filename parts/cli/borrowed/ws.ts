import type { RawData } from 'ws'
import { WebSocket } from 'ws'

/** The live connection as the runner holds it: messages as records, sent and handed on in order. */
export interface Live {
  send(message: object): void
  each(fn: (message: object) => void): void
  close(): void
}

/** A message as a record, or nothing for one that holds no JSON record. */
function recordOf(data: RawData): object | undefined {
  const text = Array.isArray(data)
    ? Buffer.concat(data).toString('utf8')
    : data instanceof ArrayBuffer
      ? Buffer.from(data).toString('utf8')
      : data.toString('utf8')
  try {
    const read: unknown = JSON.parse(text)
    return typeof read === 'object' && read !== null ? read : undefined
  } catch {
    return undefined
  }
}

/**
 * Takes the address of `/_t/live` and the lines of its opening, which a program must be able to set. Opens the
 * live connection with the borrowed WebSocket part, and answers it once it is open: what arrives before anybody
 * listens waits for them. Refused where the opening fails.
 */
export function openLive(address: string, headers: Record<string, string>): Promise<Live> {
  const socket = new WebSocket(address.replace(/^http/, 'ws'), { headers, perMessageDeflate: false })
  const waiting: object[] = []
  let handler: ((message: object) => void) | undefined
  socket.on('message', (data) => {
    const message = recordOf(data)
    if (!message) return
    if (handler) handler(message)
    else waiting.push(message)
  })
  // A failure after the opening, or a second one, would end the program where nothing listens for it.
  socket.on('error', () => undefined)
  return new Promise((done, failed) => {
    socket.once('open', () =>
      done({
        send: (message) => socket.send(JSON.stringify(message)),
        each(fn) {
          handler = fn
          for (const one of waiting.splice(0)) fn(one)
        },
        close: () => socket.close(),
      }),
    )
    socket.once('error', failed)
    socket.once('unexpected-response', (_request, response) =>
      failed(new Error(`The live connection was refused with status ${response.statusCode}.`)),
    )
  })
}
