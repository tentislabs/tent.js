import { carrying, drive, firstNames, holdsAwait, statements, steppedStatements } from './evaluate.ts'
import type { SequenceDoors } from './sequence/doors.ts'

/**
 * Takes the statements of a stored body, the record that `run` is handed, and with them `tick`, which is asked
 * before every statement and every entry of a repeat, and for a
 * sequence of an agent its three doors. Carries the body out and answers what it answers: at once where the
 * body holds no `await`, and as a promise where it holds one. It reaches a definition, a handle and a word through
 * the very functions that code calls. Throws T0009 for a chain that starts at a value which `db` did not hand out,
 * T0011 for a form that no body holds, and what the body itself throws.
 */
export function runBody(
  body: object[],
  handed: Record<string, unknown>,
  o: { tick?(): void; sequence?: SequenceDoors } = {},
): unknown {
  const names = firstNames(handed)
  const { sequence, ...rest } = o
  const cx = carrying(handed, sequence ? { ...rest, sequence: { doors: sequence, at: [], count: { n: 0 } } } : rest)
  if (!holdsAwait(body)) return statements(body, names, cx)?.value
  return drive(steppedStatements(body, names, cx)).then((ended) => ended?.value)
}
