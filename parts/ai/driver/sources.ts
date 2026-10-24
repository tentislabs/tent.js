import type { Caller, Type } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { ToolSource, ToolSpec } from '../../core/internal.ts'
import { checkValue } from '../../core/internal.ts'
import type { AiEnv } from '../face.ts'
import type { AgentOf } from './agentOf.ts'
import type { Offered } from './tools.ts'
import type { Description } from '../../core/internal.ts'
import { toolLine } from '../../core/internal.ts'

/** A tool that a source gave a run: what it is offered as, and the source that carries it out, with its context. */
export interface SourceTool {
  offered: Offered
  source: ToolSource
  context: unknown
  // The tool as the source told it, which the line of the tool is made from.
  spec: ToolSpec
}

/** Where a source is asked: the run, its starter, and the record of its agent. */
interface Asking {
  run: string
  starter: Caller
  record: object
}

/** The sources that the program that started a run named, each with what it is handed. */
function namedIn(given: unknown): { name: string; context: unknown }[] {
  const sources: unknown = Reflect.get(Object(given), 'sources')
  return Array.isArray(sources)
    ? sources.map((one) => ({
        name: String(Reflect.get(Object(one), 'name')),
        context: Reflect.get(Object(one), 'context'),
      }))
    : []
}

/**
 * Takes what the engine hands `ai`, what the program gave the run, the agent, and where its sources are asked.
 * Answers the tools of each source the run names, in the order the run names them: a tool of a source sends data out
 * unless its spec says `sends: false`, and asks first where it states `danger: 'ask'` or sends and `trust` does not
 * name it. Throws T0001 for a source that was not offered, naming it.
 */
export function sourceTools(
  env: AiEnv,
  given: unknown,
  agent: AgentOf,
  at: Asking,
  description: Description,
  called = false,
): SourceTool[] {
  const tools: SourceTool[] = []
  for (const { name, context } of namedIn(given)) {
    const source = Object.hasOwn(env.sources, name) ? env.sources[name] : undefined
    if (!source)
      throw new TentError(
        'T0001',
        `The run names the source ${JSON.stringify(name).slice(0, 80)}, which was not offered.`,
        {
          fix: 'Offer the source with `engine.offer` before the run starts, also after a restart.',
        },
      )
    for (const spec of source.tools({ ...at, context })) {
      const sends = spec.sends !== false
      const trusted = agent.trust.includes(spec.name)
      const asks = spec.danger === 'ask' || (sends && !trusted) || (trusted && called)
      const input: Type = { kind: 'object', shape: spec.input }
      // The line of a tool of a source says that it sends, and that a person is asked, as far as its spec says.
      const line = toolLine(description, agent.name, spec.name, { specs: [spec], called })
      const about = [spec.about, line].filter(Boolean).join(' ')
      tools.push({
        offered: { entry: { tool: spec.name, told: spec.name }, kind: 'source', input, about, asks, sends },
        source,
        context,
        spec,
      })
    }
  }
  return tools
}

/**
 * Carries out one call of a tool of a source, after its input was checked: T0002, with a line for each field, for
 * an input that does not fit. `ask` makes the step wait for the starter's yes, as an ask of its own.
 */
export function sourceCall(env: AiEnv, tool: SourceTool, at: Asking, input: unknown): Promise<unknown> {
  const missed = checkValue(tool.offered.input, input)
  if (missed.length)
    throw new TentError(
      'T0002',
      `The input of ${tool.offered.entry.tool} does not fit: ${missed.map((one) => one.message).join(' ')}`,
    )
  return tool.source.call({
    ...at,
    context: tool.context,
    tool: tool.offered.entry.tool,
    input,
    ask: async (what) => Boolean(await env.call('_t_agreed', [{ name: tool.offered.entry.tool, what }])),
  })
}

const isImage = (value: unknown): value is { kind: string; data: string } =>
  String(Reflect.get(Object(value), 'kind')).startsWith('image/') &&
  typeof Reflect.get(Object(value), 'data') === 'string'

/**
 * Takes the env, the starter and the run, and what a tool of a source answered. An answer that holds `images`, each
 * `{ kind, data }` with its bytes in base64, has each put as a file of the run and answers `{ result, files }`, the
 * rest of the answer beside the ids of the files, as an outside tool answers its pictures; any other as it is.
 */
export async function filedAnswer(env: AiEnv, starter: Caller, run: string, answer: unknown): Promise<unknown> {
  const images: unknown = Reflect.get(Object(answer), 'images')
  if (!Array.isArray(images) || typeof answer !== 'object' || answer === null) return answer
  const { images: _, ...result } = Object(answer)
  const files = await Promise.all(
    images.filter(isImage).map(async (one, n) => ({
      id: await env.files.put(
        new Uint8Array(Buffer.from(one.data, 'base64')),
        { name: `picture-${n + 1}.${one.kind.slice(6)}`, kind: one.kind },
        { caller: starter, run },
      ),
      kind: one.kind,
    })),
  )
  return { result, files }
}
