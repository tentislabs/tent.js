import { TentError } from '../../core/index.ts'
import type { ToolSource } from '../../core/internal.ts'
import { outsideCalls, underWay, within } from '../context.ts'

// The sources of tools offered to each engine, by the token of the engine and the name of the source.
const offered = new Map<string, Map<string, ToolSource>>()

/** Whether a value has the form of a source: `tools` and `call`, each a function. */
const isSource = (value: unknown): value is ToolSource =>
  typeof Reflect.get(Object(value), 'tools') === 'function' && typeof Reflect.get(Object(value), 'call') === 'function'

/**
 * `engine.offer`: keeps a source of tools under its name for every app of an engine, in the place of one offered
 * before under that name. Throws T0013 for a source that has not `tools` and `call`.
 */
export function offerSource(token: string, name: string, source: unknown): void {
  if (!isSource(source))
    throw new TentError('T0013', `The source ${JSON.stringify(name).slice(0, 80)} has not \`tools\` and \`call\`.`, {
      fix: 'Offer an object with `tools(o)`, which answers the specs of its tools, and `call(o)`, which carries one out.',
    })
  const held = offered.get(token) ?? new Map<string, ToolSource>()
  offered.set(token, held)
  held.set(name, source)
}

/** Forgets the sources of an engine that closed. */
export const forgetSources = (token: string): void => void offered.delete(token)

/**
 * A source as a run is handed it. What a tool of a source does is the code of the part that offered it, so it is
 * carried out as the program's own, outside the call of the run: what it fetches and which app it calls are its
 * own. Its `ask` is the run's, and is answered inside the call it was handed in.
 */
function asProgram(source: ToolSource): ToolSource {
  return {
    tools: (o) => source.tools(o),
    call(o) {
      const cx = underWay()
      const ask = (what: object): Promise<boolean> => (cx ? within(cx, () => o.ask(what)) : o.ask(what))
      return outsideCalls(() => source.call({ ...o, ask }))
    },
  }
}

/** The sources offered to the engine of a token, by their names, each carried out as the program's own. */
export const sourcesOf = (token: string): Record<string, ToolSource> =>
  Object.fromEntries(
    [...(offered.get(token) ?? new Map<string, ToolSource>())].map(([name, one]) => [name, asProgram(one)]),
  )
