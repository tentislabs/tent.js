import type { Stored } from '../record.ts'
import { keepAt } from './kept.ts'
import type { Told } from './shared.ts'
import { known, optionsOf, report, setField } from './shared.ts'
import { cookieBytes, notForDevice, stateType } from './view.ts'

/**
 * Takes the state of `project` as it was written. Answers it as it is stored: for each name its type, or its type
 * with where it is kept. Reports what the state of a project may not state (T1014): `in: 'address'`, which is for
 * a screen and a component; `back`, which is for a state that is kept in the address; a state `in: 'device'` of a
 * type that the cookie does not take; and a state that is no `boolean`, states no `default` and is not `optional`.
 */
export function projectState(told: Told, written: unknown): Stored {
  const stored: Stored = {}
  for (const [name, one] of Object.entries(optionsOf(written))) {
    const entry = optionsOf(one)
    const where = `state.${name}`
    if (typeof entry.kind === 'string') {
      keepAt(stored, name, stateType(told, where, one))
      continue
    }
    known(told, where, entry, ['type', 'in', 'back', 'reset'])
    const type = stateType(told, where, entry.type)
    const bad = (why: string, fix: string) => report(told, 'T1014', `\`${where}\` ${why}.`, fix)
    if (entry.in === 'address')
      bad(
        "is kept `in: 'address'`, which is for a screen and a component",
        "Keep it `in: 'device'` or `in: 'browser'`, or declare it on the screen.",
      )
    else if (entry.in !== undefined && entry.in !== 'device' && entry.in !== 'browser')
      bad(
        "states an `in` that is none of `'device'` and `'browser'`",
        "Write `'device'` or `'browser'`, or leave it out.",
      )
    else if (entry.back === true)
      bad('states `back`, which is for a state that is kept in the address', 'Take `back` out.')
    if (entry.in === 'device' && cookieBytes(type) === undefined) bad(...notForDevice)
    const kept: Stored = { type }
    setField(kept, 'in', entry.in)
    setField(kept, 'back', entry.back, false)
    setField(kept, 'reset', entry.reset)
    keepAt(stored, name, kept)
  }
  return stored
}
