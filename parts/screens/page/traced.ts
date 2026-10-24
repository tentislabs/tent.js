/** So many random bytes as hex, never all zeros, as the ids of the standard are. */
function idOf(bytes: number): string {
  const drawn = crypto.getRandomValues(new Uint8Array(bytes))
  const hex = Array.from(drawn, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return /^0+$/.test(hex) ? idOf(bytes) : hex
}

/**
 * The headers that begin the trace of a move of the page, a press among them: a new trace, whose first span is the
 * move itself, named in `tracestate`. Every call that the move makes carries them, so the engine holds the move and
 * all it set off as one trace.
 */
export function moveHeaders(move: 'press' | 'move' | 'load'): Record<string, string> {
  return { traceparent: `00-${idOf(16)}-${idOf(8)}-01`, tracestate: `tent=${move}` }
}
