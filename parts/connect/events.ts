/** One event of a stream of server-sent events: its name, where the server gave one, and its data. */
export interface ServerEvent {
  event?: string
  data: string
}

/**
 * Takes the body of an answer that the server sends as server-sent events. Answers each event as it arrives,
 * with the lines of its data joined by line feeds. A line that starts with a colon is a comment, and is passed over.
 */
export async function* eventsOf(body: ReadableStream<Uint8Array> | null): AsyncGenerator<ServerEvent> {
  if (!body) return
  const decoder = new TextDecoder()
  let held = ''
  let event: string | undefined
  let data: string[] = []
  const ended = (): ServerEvent | undefined => {
    const one = data.length ? { ...(event === undefined ? {} : { event }), data: data.join('\n') } : undefined
    event = undefined
    data = []
    return one
  }
  // A CR that ended the text so far may be the first half of a CR LF, whose LF starts the next piece.
  let afterCr = false
  for await (const piece of body) {
    held += decoder.decode(piece, { stream: true })
    if (afterCr && held !== '') {
      if (held.startsWith('\n')) held = held.slice(1)
      afterCr = false
    }
    let end = held.search(/\r\n|\r|\n/)
    while (end >= 0) {
      const line = held.slice(0, end)
      afterCr = held.length === end + 1 && held[end] === '\r'
      held = held.slice(end + (held.startsWith('\r\n', end) ? 2 : 1))
      if (line === '') {
        const one = ended()
        if (one) yield one
      } else if (!line.startsWith(':')) {
        const colon = line.indexOf(':')
        const field = colon < 0 ? line : line.slice(0, colon)
        const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
        if (field === 'event') event = value
        else if (field === 'data') data.push(value)
      }
      end = held.search(/\r\n|\r|\n/)
    }
  }
  held += decoder.decode()
  if (held !== '' && !held.startsWith(':') && held.startsWith('data:')) data.push(held.slice(5).replace(/^ /, ''))
  const last = ended()
  if (last) yield last
}
