import type { TestContext } from 'node:test'
import type { Provider, ReplyPart } from '../index.ts'
import { counts } from '../index.ts'
import type { Bundling, Running } from './apps.ts'
import { join } from 'node:path'
import { bundled, engineOf, portOf, testClock, workFolder } from './apps.ts'
import type { EngineOptions, OpenOptions } from '../index.ts'

/** One row of the counts, as a program reads it. */
interface Count {
  day: string
  name: string
  answeredBy: string
  caller: string
  user?: string
  unit: string
  amount: number
}

/** A provider of the tests: each answer is the text it is told, and after a tool it answers what the tool gave. */
const answering: Provider = {
  async *reply(o): AsyncGenerator<ReplyPart> {
    const last = o.messages.at(-1)
    if (last?.who === 'user' && String(last.text).includes('notes')) {
      yield { end: { text: '', calls: [{ id: 'c1', tool: 'listNotes', input: {} }], units: { tokensIn: 3 } } }
      return
    }
    const text = last?.who === 'tool' ? 'Here are the notes.' : 'Hello.'
    yield { text }
    yield { end: { text, calls: [], units: { tokensIn: 3, tokensOut: 2 } } }
  },
}

/** An app of the project of the counts, what moves its clock, and what reads what it counted. */
export interface Counting extends Running {
  advance(ms: number): void
  // Moves the clock by one `countEvery`, so that what was gathered is written, and answers every row.
  counted(): Promise<Count[]>
  // The sum of one unit of one thing over the rows, by the caller where one is named.
  sum(rows: Count[], name: string, unit: string, caller?: string): number
}

/**
 * Opens the project of the counts on a clock that the test moves, with the providers and the makers it names.
 * `laid` is handed the folder of the bundle before it is opened, to lay files of its own into it.
 */
export async function counting(
  t: TestContext,
  o: Bundling & {
    open?: Partial<OpenOptions>
    engine?: EngineOptions
    providers?: Record<string, Provider>
    laid?: (folder: string) => void
  } = {},
): Promise<Counting> {
  const { clock, advance } = testClock()
  const { providers, engine, laid, open, ...rest } = o
  const work = workFolder(t)
  const bundle = await bundled(t, { project: 'counting', ...rest }, work)
  laid?.(bundle.folder)
  const made = engineOf(t, {
    ...engine,
    makers: { clock: () => clock, providers: () => ({ mine: answering, ...providers }), ...engine?.makers },
  })
  const dataFolder = join(work, 'data')
  const app = await made.open(bundle.folder, { dataFolder, mode: 'test', ...open })
  const port = portOf(dataFolder)
  const run: Running = { engine: made, app, bundle, dataFolder, port, origin: `http://localhost:${port}` }
  const counted = async (): Promise<Count[]> => {
    advance(60_000)
    const rows: unknown = await run.app.read(counts.where({}), { as: 'system' })
    return (Array.isArray(rows) ? rows : []).map((one) => ({
      day: String(Object(one).day),
      name: String(Object(one).name),
      answeredBy: String(Object(one).answeredBy),
      caller: String(Object(one).caller),
      ...(Object(one).user ? { user: String(Object(one).user) } : {}),
      unit: String(Object(one).unit),
      amount: Number(Object(one).amount),
    }))
  }
  const sum = (rows: Count[], name: string, unit: string, caller?: string): number =>
    rows
      .filter((one) => one.name === name && one.unit === unit && (caller === undefined || one.caller === caller))
      .reduce((all, one) => all + one.amount, 0)
  return { ...run, advance, counted, sum }
}
