import type { Tx } from '../../data/index.ts'
import type { Opened } from '../opened.ts'

const system = { kind: 'system' } as const

/** The tables that the memory of an agent of the app keeps its conversations in. */
function memoryTables(o: Opened): string[] {
  const tables = new Set<string>()
  for (const flow of Object.values(o.description.flows)) {
    const memory: unknown = Reflect.get(Object(flow.agent), 'memory')
    const into: unknown = Reflect.get(Object(memory), 'in')
    if (typeof into === 'string') tables.add(into)
  }
  return [...tables]
}

/**
 * The summaries' part of a person's removal, in the write that removes their rows: a summary has no owner, so the
 * summaries that the person's runs wrote into a conversation go here, with the rest of what was theirs.
 */
export function forgetSummaries(o: Opened, tx: Tx, runs: string[]): void {
  if (!runs.length) return
  const theirs = new Set(runs)
  for (const name of memoryTables(o)) {
    const read: unknown = tx.read({ from: name, where: { col: 'who', is: 'summary' } }, system)
    for (const row of Array.isArray(read) ? read : []) {
      const run: unknown = Reflect.get(Object(row), 'run')
      if (typeof run === 'string' && theirs.has(run)) tx.remove(name, { id: Reflect.get(Object(row), 'id') }, system)
    }
  }
}
