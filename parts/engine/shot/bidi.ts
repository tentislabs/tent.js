import { commandsOver, openedWithin } from './channel.ts'

type Params = Record<string, unknown>

/** A session of WebDriver BiDi over its connection: what it sends, and what it hears. */
export interface Bidi {
  /**
   * Sends a command of the session, and answers what the browser answered. Throws what the browser refused it with,
   * and T0016 where no answer came within `within` milliseconds, three minutes where it names none.
   */
  send(method: string, params?: Params, within?: number): Promise<Params>
  // Names what is told each event of that name.
  on(method: string, heard: (params: Params) => void): void
  close(): void
}

/**
 * Takes the address of the connection of WebDriver BiDi (https://w3c.github.io/webdriver-bidi/). Opens it, and
 * answers what drives it. Throws T0016 where the connection cannot be opened, or is not open within ten seconds.
 */
export async function bidiAt(address: string): Promise<Bidi> {
  const socket = new WebSocket(address)
  await openedWithin(socket, 'The connection of WebDriver BiDi')
  const commands = commandsOver((text) => socket.send(text), 'The connection of WebDriver BiDi')
  // A browser that ends closes its connection.
  socket.addEventListener('close', () => commands.closed())
  const heard = new Map<string, ((params: Params) => void)[]>()
  socket.addEventListener('message', (event) => {
    const told: unknown = JSON.parse(String(event.data))
    const message: Params = typeof told === 'object' && told !== null ? Object(told) : {}
    if (typeof message.id === 'number') {
      commands.answer(
        message.id,
        message.type === 'error'
          ? { error: new Error(`${String(message.error)}: ${String(message.message)}`) }
          : { value: Object(message.result ?? {}) },
      )
      return
    }
    if (message.type === 'event' && typeof message.method === 'string')
      for (const one of heard.get(message.method) ?? []) one(Object(message.params ?? {}))
  })
  return {
    send: (method, params = {}, within) => commands.send({ method, params }, within),
    on: (method, one) => heard.set(method, [...(heard.get(method) ?? []), one]),
    close: () => socket.close(),
  }
}
