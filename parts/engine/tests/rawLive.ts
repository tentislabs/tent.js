import { randomBytes } from 'node:crypto'
import { request } from 'node:http'
import type { Duplex } from 'node:stream'
import type { App } from '../index.ts'
import { system } from './apps.ts'
import { liveMoment, untilTried, watcher } from './watching.ts'

/** The opening of `/_t/live` over a real connection, with the frames written by the test itself, as an attacker's program writes them. */
export interface RawLive {
  // The status of a refusal, or 101, with the extensions that the engine agreed to.
  status: number
  extensions: string
  // The texts that arrived so far, each read from JSON, and how many bytes arrived in all.
  got: Record<string, unknown>[]
  bytes(): number
  closed(): boolean
  // Sends one frame: 1 is a text, 2 is bytes. `packed` sets the bit that says the frame is packed.
  frame(opcode: number, payload: string | Buffer, packed?: true): void
  text(message: object): void
  // Takes nothing more of what it is sent, and takes it again.
  pause(): void
  resume(): void
  end(): void
}

/** One frame as a page sends it: masked, in one piece. */
function framed(opcode: number, payload: Buffer, packed: boolean): Buffer {
  const mask = randomBytes(4)
  const head =
    payload.length < 126
      ? Buffer.from([0, 0x80 | payload.length])
      : payload.length < 65_536
        ? Buffer.from([0, 0x80 | 126, payload.length >> 8, payload.length & 255])
        : Buffer.concat([Buffer.from([0, 0x80 | 127, 0, 0, 0, 0]), Buffer.alloc(4)])
  if (payload.length >= 65_536) head.writeUInt32BE(payload.length, 6)
  head[0] = 0x80 | (packed ? 0x40 : 0) | opcode
  const body = Buffer.from(payload)
  for (let at = 0; at < body.length; at++) body[at] ^= mask[at % 4]
  return Buffer.concat([head, mask, body])
}

/**
 * Asks for the opening of `/_t/live` over a real connection to this computer, with the headers of the test. Answers
 * what was answered: a refusal with its status, or the connection, whose frames the test writes and reads itself.
 */
export function rawLive(port: number, headers: Record<string, string>, path = '/_t/live'): Promise<RawLive> {
  return new Promise((done, failed) => {
    const asking = request({
      host: '127.0.0.1',
      port,
      path,
      headers: {
        host: `localhost:${port}`,
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': randomBytes(16).toString('base64'),
        ...headers,
      },
    })
    const none = { extensions: '', got: [], bytes: () => 0, closed: () => true }
    const nothing = { frame: () => {}, text: () => {}, pause: () => {}, resume: () => {}, end: () => {} }
    asking.on('response', (answer) => {
      answer.resume()
      done({ status: answer.statusCode ?? 0, ...none, ...nothing })
    })
    asking.on('upgrade', (answer, socket: Duplex, head) => {
      const got: Record<string, unknown>[] = []
      let [closed, bytes, kept] = [false, 0, Buffer.from(head)]
      // What arrives is read frame by frame: the engine sends each message in one piece, and masks nothing.
      const read = (): void => {
        for (;;) {
          if (kept.length < 2) return
          const short = kept[1] & 127
          const headLength = short < 126 ? 2 : short === 126 ? 4 : 10
          if (kept.length < headLength) return
          const length = short < 126 ? short : short === 126 ? kept.readUInt16BE(2) : kept.readUInt32BE(6)
          if (kept.length < headLength + length) return
          const payload = kept.subarray(headLength, headLength + length)
          if ((kept[0] & 15) === 1) got.push(JSON.parse(payload.toString('utf8')))
          kept = kept.subarray(headLength + length)
        }
      }
      socket.on('data', (data: Buffer) => {
        bytes += data.length
        kept = Buffer.concat([kept, data])
        read()
      })
      socket.on('close', () => {
        closed = true
      })
      socket.on('error', () => {
        closed = true
      })
      read()
      const frame = (opcode: number, payload: string | Buffer, packed?: true): void => {
        if (!closed) socket.write(framed(opcode, Buffer.from(payload), packed === true))
      }
      done({
        status: 101,
        extensions: String(answer.headers['sec-websocket-extensions'] ?? ''),
        got,
        bytes: () => bytes,
        closed: () => closed,
        frame,
        text: (message) => frame(1, JSON.stringify(message)),
        pause: () => void socket.pause(),
        resume: () => void socket.resume(),
        end: () => void socket.destroy(),
      })
    })
    asking.on('error', failed)
    asking.end()
  })
}

/**
 * Answers what tells that the hub has run every group that the writes so far marked: a notice is added, and the
 * page that watches the notices is sent it after everything that was marked before.
 */
export async function quietOf(app: App, origin: string): Promise<() => Promise<void>> {
  const guard = watcher(app, origin)
  await guard.watch('guard', 'allNotices')
  return async () => {
    const before = guard.got.length
    await app.call('addNotice', { text: `guard ${before}` }, { as: system })
    await untilTried('the hub ran what was marked', () => guard.got.length > before)
    await liveMoment(20)
  }
}
