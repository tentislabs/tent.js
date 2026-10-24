/** One thing that the content policy of a page blocked: the line of the policy that held it, and what it was. */
export interface Blocked {
  directive: string
  uri: string
}

// The lines of the policy that an entry of `unlock` opens by a list of hosts.
const lists: Record<string, string> = {
  'script-src': 'scripts',
  'script-src-elem': 'scripts',
  'style-src': 'styles',
  'style-src-elem': 'styles',
  'font-src': 'fonts',
  'frame-src': 'frames',
}

/** The scheme and the host of an address, as an entry of `unlock` names a host, or the address as it is where it has none. */
function hostOf(uri: string): string {
  try {
    const { protocol, host } = new URL(uri)
    return host ? `${protocol}//${host}` : uri
  } catch {
    return uri
  }
}

/**
 * Takes one thing that the content policy blocked. Answers the entry of `unlock` in `project` that would open it,
 * and nothing else, as it is written: a list of hosts for a script, a style file, a font and a frame, a switch for
 * code made from text, WebAssembly, style rules that code adds and a background script made from text, and `more`
 * with the line of the policy for anything else.
 */
export function unlockFor(blocked: Blocked): string {
  const { directive, uri } = blocked
  const line = directive.split(' ')[0]
  if (uri === 'eval') return 'unlock: { eval: true }'
  if (uri === 'wasm-eval' || uri === 'wasm-unsafe-eval') return 'unlock: { wasm: true }'
  if (uri === 'inline' && line.startsWith('style-src')) return 'unlock: { styleTags: true }'
  if (uri === 'blob' && (line === 'worker-src' || line.startsWith('script-src'))) return 'unlock: { blobWorkers: true }'
  const host = hostOf(uri)
  if (Object.hasOwn(lists, line)) return `unlock: { ${lists[line]}: ['${host}'] }`
  return `unlock: { more: { '${line}': ['${host}'] } }`
}
