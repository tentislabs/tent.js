import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { writeKey } from '../../engine/index.ts'
import type { Remote } from './remotes.ts'
import { remoteOf } from './remotes.ts'
import type { Served } from './served.ts'
import { served } from './served.ts'

/**
 * The page of a chat app of the tests, which it serves from this computer: it reads the file of a screen from the
 * app's `/mcp` with a key, shows it in a frame of no origin of its own, answers the frame's messages as the
 * standard's extension writes them, hands a call of a tool on to the app, and keeps each address that the frame
 * asks it to open in `window.opened`. `?closed` lays a policy over the frame that lets it connect nowhere.
 */
function hostPage(app: string, key: string, screen: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>A chat app</title></head><body>
<h1>A chat app</h1>
<script>
window.opened = []
window.asked = []
const app = ${JSON.stringify(app)}
const key = ${JSON.stringify(key)}
let ids = 0
async function mcp(method, params) {
  const answer = await fetch(app + '/mcp', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json', 'mcp-protocol-version': '2026-07-28', 'mcp-method': method },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++ids, method, params: { ...params, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} } } }),
  })
  return (await answer.json()).result
}
async function show() {
  const listed = await mcp('tools/list', {})
  const tool = listed.tools.find((one) => one.name === ${JSON.stringify(screen)})
  const uri = tool._meta.ui.resourceUri
  const read = await mcp('resources/read', { uri })
  let text = read.contents[0].text
  if (location.search.includes('closed'))
    text = text.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="connect-src \\'none\\'">')
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-scripts allow-forms')
  frame.style.width = '600px'
  frame.style.height = '600px'
  frame.srcdoc = text
  window.addEventListener('message', async (event) => {
    if (event.source !== frame.contentWindow) return
    const message = event.data
    if (!message || message.jsonrpc !== '2.0') return
    const reply = (result) => frame.contentWindow.postMessage({ jsonrpc: '2.0', id: message.id, result }, '*')
    if (message.method === 'ui/initialize') {
      reply({ protocolVersion: '2026-01-26', hostCapabilities: { openLinks: {}, serverTools: {} }, hostContext: { locale: 'en' } })
      const result = await mcp('tools/call', { name: ${JSON.stringify(screen)}, arguments: {} })
      frame.contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: result }, '*')
    } else if (message.method === 'tools/call') {
      window.asked.push(message.params.name)
      reply(await mcp('tools/call', message.params))
    } else if (message.method === 'ui/open-link') {
      window.opened.push(message.params.url)
      reply({})
    } else if (message.id !== undefined) reply({})
  })
  document.body.append(frame)
}
void show()
</script></body></html>`
}

/** A served copy of the project of a screen in a chat, the chat app beside it, a person of the app and a key of theirs. */
export interface Chatted {
  host: Remote
  at: Served
  ada: string
  key: string
}

/**
 * Serves a copy of the project of a screen in a chat, with the address of a chat app of the tests listed in place of
 * the one it holds, and that chat app on this computer, which shows a screen as a person of the app with a key that
 * may read screens.
 */
export async function chatServed(
  t: TestContext,
  screen: string,
  o: { for?: 'dev' | 'release' } = {},
): Promise<Chatted> {
  let address = ''
  let key = ''
  const host = await remoteOf(t, (_heard, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(hostPage(address, key, screen))
  })
  const at = await served('mcpScreened', {
    ...o,
    change: (folder) => {
      const file = join(folder, 'tent.ts')
      writeFileSync(file, readFileSync(file, 'utf8').replace("'http://127.0.0.1:9'", JSON.stringify(host.origin)))
    },
  })
  address = at.address
  const made: unknown = await at.app.write([{ add: 'users', values: { email: 'ada@example.com', roles: [] } }], {
    as: 'system',
  })
  const ada = String(Object(Array.isArray(made) ? made[0] : made).id)
  key = writeKey(at.app, { user: ada, scopes: ['*', 'screens'] }).key
  return { host, at, ada, key }
}
