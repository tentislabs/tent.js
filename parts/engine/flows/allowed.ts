// The rule of a flow or of an agent, as the rule of a function is: a rule made with `allow` is asked.
import type { Caller } from '../../core/index.ts'
import type { CallContext } from '../context.ts'
import { allows } from '../door/carry.ts'
import { callerOf, refusedBy, ruled } from '../door/rule.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { flowKey } from './code.ts'

const never = new AbortController().signal

/**
 * Takes an app, the name of a flow or an agent, its `access` as stored, the checked input of a start, and the
 * caller. Answers nothing where the rule lets the caller in, or what the rule needs: a rule made with `allow` is
 * asked on that input, with a `db` that reads as the caller.
 */
export function flowRuled(
  o: Opened,
  name: string,
  access: unknown,
  input: unknown,
  caller: Caller,
): { rule: string; needs: string } | undefined {
  const said = ruled(access, caller)
  if ('needs' in said) return said
  if (said.says !== 'asks') return undefined
  const cx: CallContext = {
    app: o,
    version: o.version,
    caller,
    made: 0,
    signal: never,
    work: {
      name,
      kind: 'action',
      depth: 1,
      now: new Date(o.clock.now()),
      ends: performance.now() + storedLimit(o.description, 'actionTime'),
    },
  }
  const arrow = o.allows.get(flowKey(name))
  const handed: Record<string, unknown> = Object(input)
  const asking = { access: Object(access), input: handed, ...(arrow ? { arrow } : {}) }
  return allows(o, cx, asking) ? undefined : { rule: said.rule, needs: 'needs a caller that its rule lets in' }
}

/**
 * As `flowRuled`, for a start: answers nothing where the rule lets the caller in. Throws T0006 or T3101 for a
 * caller it keeps out, which `denied` of the log records.
 */
export function flowLetsIn(o: Opened, name: string, access: unknown, input: unknown, caller: Caller): void {
  const out = flowRuled(o, name, access, input, caller)
  if (!out) return
  o.log.write('denied', { at: o.clock.now(), name, ...callerOf(caller), rule: out.rule })
  throw refusedBy(name, out.needs, caller)
}
