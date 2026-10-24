import type { Link } from '../copy/link.ts'
import { tell } from '../copy/link.ts'
import type { Opened } from '../opened.ts'
import type { SpanRow } from './keeping.ts'
import { keptFrom, spansAway } from './keeping.ts'

// The most spans a machine holds for its writer while it has no link: past it the oldest are dropped.
const heldMost = 20_000

// The link each machine sends its spans over now, and what waits for one.
const links = new WeakMap<Opened, { link?: Link; waiting: SpanRow[] }>()

/**
 * Takes a reader or a worker of an app, and the link to its writer as it opens. From here on the spans it keeps are
 * sent to the writer over the link, which keeps them in its log: what was kept while no link stood is sent first.
 */
export function spansToWriter(o: Opened, link: Link): void {
  let held = links.get(o)
  if (!held) {
    const made: { link?: Link; waiting: SpanRow[] } = { waiting: [] }
    held = made
    links.set(o, made)
    spansAway(o, (rows) => {
      if (made.link) tell(made.link, { t: 'spans', rows })
      else {
        made.waiting.push(...rows)
        if (made.waiting.length > heldMost) made.waiting.splice(0, made.waiting.length - heldMost)
      }
    })
  }
  held.link = link
  if (held.waiting.length) tell(link, { t: 'spans', rows: held.waiting.splice(0) })
}

const text = (value: unknown, most: number): string | undefined =>
  typeof value === 'string' && value.length <= most ? value : undefined

/** One row of spans as another machine sent it, held to the form of the table, or nothing for one of another form. */
function rowOf(sent: unknown, machine: string): SpanRow | undefined {
  const row: Record<string, unknown> = Object(sent)
  const trace = text(row.trace, 32)
  const span = text(row.span, 16)
  const name = text(row.name, 200)
  const kind = text(row.kind, 20)
  const facts = text(row.facts, 10_000)
  if (!trace || !/^[0-9a-f]{32}$/.test(trace) || !span || !/^[0-9a-f]{16}$/.test(span) || !name || !kind || !facts)
    return undefined
  if (typeof row.at !== 'number' || typeof row.ms !== 'number' || typeof row.ok !== 'boolean') return undefined
  const parent = text(row.parent, 16)
  const code = text(row.code, 40)
  return {
    trace,
    span,
    ...(parent ? { parent } : {}),
    at: row.at,
    ms: row.ms,
    name,
    kind,
    ok: row.ok,
    ...(code ? { code } : {}),
    facts,
    // The machine is the one the link was opened by, whatever the row says.
    machine,
  }
}

/** Takes a writer, the machine a message came from over the link, and the message. Keeps the spans it holds. */
export function spansFrom(o: Opened, machine: string, message: Record<string, unknown>): void {
  const rows = Array.isArray(message.rows) ? message.rows.slice(0, 5000) : []
  keptFrom(
    o,
    rows.map((one) => rowOf(one, machine)).filter((one): one is SpanRow => one !== undefined),
  )
}
