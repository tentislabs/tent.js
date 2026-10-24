/** One call of a chain, as the trace of an error names it: the function, where its code lies, its line and column. */
export interface TraceCall {
  name?: string
  at: string
  line: number
  column: number
}

// The runtime and the browsers of the Chromium family write `at name (place:line:column)`; Firefox and WebKit
// write `name@place:line:column`.
const ofV8 = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/
const ofOthers = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/

/** Takes the trace of an error, from the runtime or from a browser. Answers each call it names, the innermost first. */
export function framesOf(stack: string): TraceCall[] {
  const frames: TraceCall[] = []
  for (const written of stack.split('\n').slice(0, 200)) {
    const read = ofV8.exec(written) ?? ofOthers.exec(written)
    if (!read) continue
    const [, name, at, line, column] = read
    frames.push({ ...(name ? { name: name.trim() } : {}), at, line: Number(line), column: Number(column) })
  }
  return frames
}
