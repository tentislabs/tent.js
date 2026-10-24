import { TentError } from '../../core/index.ts'
import { isStored } from '../../core/internal.ts'
import { headers, meta, methods, older } from './standard.ts'

/** One message of a request, with the form of the standard that its client speaks. */
export interface McpRequest {
  message: Record<string, unknown>
  // The version of the standard: the newest, or the older one that the client opened with or names in its line.
  version: string
  // What a client of the newest form says that it can do, with this request.
  can: Record<string, unknown>
}

/** The failure of a request that is no message of the standard, or one whose lines and body do not agree. */
const unread = (message: string, fix: string): TentError => new TentError('T0002', message, { fix })

/**
 * Reads the body of a request of `/mcp`: one message of the standard, of the newest form or an older one. Throws
 * T0002 for a body that is no JSON, for a list of messages, for one that is no message, for a request whose lines
 * of its method and of what a call or a reading names say another than its body, and for one of the newest form
 * whose line of its version does.
 */
export function readMessage(text: string, lines: Headers): McpRequest {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw unread('The body of a request of MCP is no JSON.', 'Send one message of the standard, as JSON.')
  }
  if (Array.isArray(body))
    throw unread('A body of MCP holds one message, and this one holds a list.', 'Send each message on its own.')
  if (!isStored(body) || body.jsonrpc !== '2.0')
    throw unread('The body is no message of the standard.', 'Send `{ "jsonrpc": "2.0", "method", "params", "id" }`.')
  const params = isStored(body.params) ? body.params : {}
  const said = isStored(params._meta) ? params._meta : {}
  const stated = said[meta.version]
  // A client of either form may say the method in a line, and for a call and a reading what it names.
  const method = lines.get(headers.method)
  const name = lines.get(headers.name)
  const names = body.method === methods.call ? params.name : body.method === methods.read ? params.uri : undefined
  if ((method !== null && method !== body.method) || (name !== null && name !== names))
    throw unread(
      'The lines of the request name another method or name than its body.',
      'Send the method and the name of the body in the lines too, or leave the lines out.',
    )
  if (typeof stated === 'string') {
    const version = lines.get(headers.version)
    if (version !== null && version !== stated)
      throw unread(
        'The lines of the request name another version than its body.',
        'Send the version of the body in the line too, or leave the line out.',
      )
    const can = said[meta.can]
    return { message: body, version: stated, can: isStored(can) ? can : {} }
  }
  // An older client names its version when it opens, and in its line after that.
  const opening = body.method === methods.open && typeof params.protocolVersion === 'string'
  const named = opening ? String(params.protocolVersion) : lines.get(headers.version)
  const version = named !== null && older.includes(named) ? named : older[0]
  return { message: body, version, can: {} }
}
