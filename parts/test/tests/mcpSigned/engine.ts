import type { Makers } from 'tentjs/engine'

// A maker that keeps the request to a client of MCP where the action `askClient` reaches it, in the heap where the
// code of the app runs: so a test asks a client as a `Provider` of the builder's own would.
export default {
  verifiers: (input) => {
    Reflect.set(globalThis, 'tentMcpRequest', input.mcp.request)
    return {}
  },
} satisfies Makers
