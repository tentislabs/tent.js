import { service } from 'tentjs'

Reflect.set(globalThis, 'crossingLoaded', [...(Reflect.get(globalThis, 'crossingLoaded') ?? []), import.meta.url])

// An outside server of MCP whose program is started for the app: it reads its input until it ends.
export const local = service('local', {
  mcp: { command: ['node', '-e', "process.stdin.on('data', () => undefined); process.stdin.resume()"] },
})
