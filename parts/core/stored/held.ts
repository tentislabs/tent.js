import { isStored } from '../record.ts'
import { isZone, lengthOf } from '../time.ts'
import type { Told } from './shared.ts'
import { insideOf, report } from './shared.ts'
import { shownAs } from './shown.ts'

/** The words that move a moment or a day by a length of time. */
const moving = ['later', 'earlier']

/**
 * Takes a stored record, and walks every value in it. Reports a written zone of `dayOf` that the runtime does not
 * know (T1014), a written length of `later` and of `earlier` that does not read (T1011), and a secret named `then`
 * (T1009), wherever a stored value holds one. A zone and a length that are worked out are held while running.
 */
export function heldWords(told: Told, node: unknown): void {
  if (Array.isArray(node)) for (const one of node) heldWords(told, one)
  if (!isStored(node)) return
  const [, second] = Array.isArray(node.args) ? node.args : []
  if (node.fn === 'dayOf' && typeof second === 'string' && !isZone(second))
    report(
      told,
      'T1014',
      `\`dayOf\` names no time zone that the runtime knows: ${shownAs(second)}.`,
      "Write the name of a zone, as 'Europe/Istanbul'.",
    )
  if (typeof node.fn === 'string' && moving.includes(node.fn) && typeof second === 'string' && !lengthOf(second))
    report(
      told,
      'T1011',
      `\`${node.fn}\` is handed no length of time: ${shownAs(second)}.`,
      "Write a number and a unit, as '30 seconds' or '7 days'.",
    )
  // The runtime takes whatever answers a member named `then` for a promise, so no secret can be read under it.
  if (node.secret === 'then' && Object.keys(node).length === 1)
    report(told, 'T1009', 'the secret name `then` is reserved.', 'Give the secret another name.')
  for (const one of insideOf(node)) heldWords(told, one)
}
