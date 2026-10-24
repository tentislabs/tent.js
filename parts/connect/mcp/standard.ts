// The words of the MCP standard that the layer reads and writes, in one place, so that the next change of the
// standard touches this file. What each stands on is written in `sources.md` beside it.

/** The newest form: every request carries its version and what the client can do, with no opening exchange. */
export const newest = '2026-07-28'

/** The older forms, in which a client first sends the opening request, newest first. */
export const older = ['2025-11-25', '2025-06-18', '2025-03-26']

/** The keys of `_meta` under which a request of the newest form carries its version and what the client can do. */
export const meta = {
  version: 'io.modelcontextprotocol/protocolVersion',
  can: 'io.modelcontextprotocol/clientCapabilities',
}

/** The lines of a request of the newest form that state its version and its method, beside the body. */
export const headers = { version: 'mcp-protocol-version', method: 'mcp-method', name: 'mcp-name' }

/** The methods that the layer answers by itself. */
export const methods = {
  discover: 'server/discover',
  open: 'initialize',
  alive: 'ping',
  list: 'tools/list',
  call: 'tools/call',
  listen: 'subscriptions/listen',
  changed: 'notifications/tools/list_changed',
  question: 'elicitation/create',
  // A model call that a server asks its client to make for it.
  sample: 'sampling/createMessage',
  resources: 'resources/list',
  read: 'resources/read',
}

/** The mark of an answer of the newest form that more is needed of the client before the call can be made. */
export const moreNeeded = 'input_required'

/** What a client answers to a question: a yes is `accept`. */
export const accepted = 'accept'

/** The numbers of a failure of the message format that the standard rests on. */
export const failures = { request: -32600, method: -32601, resource: -32002 }

/** The extension of the standard that shows a screen of the app in a frame of the chat app, and the kind of its file. */
export const app = { extension: 'io.modelcontextprotocol/ui', kind: 'text/html;profile=mcp-app' }
