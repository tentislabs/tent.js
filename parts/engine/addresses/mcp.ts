import { bounded } from '../bounded.ts'
import type { Address } from '../door/address.ts'
import { refusedCall } from '../door/failure.ts'
import { counted } from '../door/rate.ts'
import { limitOf } from '../limits.ts'
import { mcpEnvOf } from '../mcp/env.ts'
import { offersToMcp } from '../mcp/offers.ts'
import { screenRequestCounted } from '../pages/count.ts'
import { visit } from '../visit.ts'
import { errorAnswer } from '../wire.ts'

/**
 * `/mcp`, in an app that offers something to MCP: the layer of `connect`, loaded at its first request. A request
 * passes steps 1 to 4 here, and each call of a tool steps 5 to 10. A request with a caller counts on that caller's
 * own number, and one with none is counted like a request for a screen, for its address. In any other app the
 * address is a route's like any other.
 */
export const address: Address = {
  order: 2,
  match(request) {
    const o = visit()?.app
    return new URL(request.url).pathname === '/mcp' && o !== undefined && offersToMcp(o.description) && { name: 'mcp' }
  },
  steps: [1, 2, 3, 10],
  async handle({ app, request, caller, about, began }) {
    try {
      if (caller.kind === 'nobody') screenRequestCounted(app, about.from)
      else counted(app, caller, about.from)
    } catch (error) {
      refusedCall(app, 'mcp', caller, began, error)
      return errorAnswer(app, 'mcp', error)
    }
    const { mcpServer } = await import('../../connect/index.ts')
    const server = mcpServer(mcpEnvOf(app, request, about))
    return server.handle(bounded(request, limitOf(app.description, 'callSize')), { caller, origin: about.origin })
  },
}
