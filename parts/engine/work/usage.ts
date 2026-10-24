import { TentError } from '../../core/index.ts'
import type { StorePlan } from '../../data/index.ts'
import { summed } from '../counts/book.ts'
import { dayOf } from '../counts/day.ts'
import type { Gathered } from '../counts/gather.ts'
import { gatheredOf } from '../counts/gather.ts'
import type { Opened } from '../opened.ts'
import { machineCountedAs } from './machineTime.ts'
import type { InQueue, OutTask } from './state.ts'
import { isStored } from '../../core/internal.ts'

/** One limit of use as it stands: whose it is, its unit and most, what was used today and what the tasks out reserve. */
export interface LimitStanding {
  which: 'kind' | 'caller' | 'definition'
  kind: string
  name?: string
  caller?: string
  unit: string
  limit: number
  used: number
  reserved: number
  atLimit: 'wait' | 'fail'
}

/** What a task that is out reserves, and whose: its kind, its definition, its counted caller, in seconds. */
export interface Reserve {
  kind: string
  name: string
  caller: string
  seconds: number
}

/** The units of machine time that `machineSeconds` sums: all the time the machines of a kind stood. */
const standing = ['workSeconds', 'loadSeconds', 'idleSeconds']

/** The reserve of a task that is out, and whose it is, as the runner holds its first run. */
export function reserveOf(o: Opened, out: OutTask): Reserve {
  const run = out.steps[0]?.run ?? ''
  return {
    kind: out.kind,
    name: o.flows?.runner.read(run)?.flow ?? '',
    caller: machineCountedAs(o, out.kind, run).caller,
    seconds: (out.reserve ?? 0) / 1000,
  }
}

/** What was used today of one unit by the rows that fit, written and gathered: `machineSeconds` as what it sums. */
function usedToday(o: Opened, unit: string, of: { kind?: string; name?: string; caller?: string }): number {
  const where: StorePlan['where'] = {
    all: [
      { col: 'day', is: dayOf(o) },
      ...(of.kind === undefined ? [] : [{ col: 'answeredBy', is: of.kind }]),
      ...(of.name === undefined ? [] : [{ col: 'name', is: of.name }]),
      ...(of.caller === undefined ? [] : [{ col: 'caller', is: of.caller }]),
    ],
  }
  const fits = (one: Gathered): boolean =>
    (of.kind === undefined || one.answeredBy === of.kind) &&
    (of.name === undefined || one.name === of.name) &&
    (of.caller === undefined || one.caller === of.caller)
  const written = summed(o, where)
  const gathered = gatheredOf(o, fits)
  const units = unit === 'machineSeconds' ? standing : [unit]
  return units.reduce((sum, one) => sum + (written[one] ?? 0) + (gathered[one] ?? 0), 0)
}

/** The units of a record of limits, each with its most. */
const unitsOf = (value: unknown): [string, number][] =>
  Object.entries(isStored(value) ? value : {}).filter((one): one is [string, number] => typeof one[1] === 'number')

/** What a record of limits says at its limit: `wait`, unless it states `fail`. */
const atLimitOf = (limits: Record<string, unknown>): 'wait' | 'fail' => (limits.atLimit === 'fail' ? 'fail' : 'wait')

/**
 * Takes an app, the kind, the definition and the counted caller of work, and the reserves of the tasks that are
 * out. Answers each limit of use that holds such work, as it stands now: `perDay` of the kind, `perCallerPerDay` of
 * the kind for that caller, and `perDay` of the definition, each with what was used today and what is reserved.
 */
export function limitsFor(
  o: Opened,
  work: { kind: string; name?: string; caller?: string },
  reserves: () => Reserve[],
): LimitStanding[] {
  const workers: unknown = o.description.project.workers
  const ofKind: unknown = Reflect.get(Object(Reflect.get(Object(workers), work.kind)), 'limits')
  const kindLimits = isStored(ofKind) ? ofKind : {}
  const fn: unknown =
    work.name !== undefined && Object.hasOwn(o.description.functions, work.name)
      ? o.description.functions[work.name]?.limits
      : undefined
  const fnLimits = isStored(fn) ? fn : {}
  const found: LimitStanding[] = []
  // What is out is read once, and only where a limit holds the work.
  let out: Reserve[] | undefined
  const add = (
    which: LimitStanding['which'],
    limits: Record<string, unknown>,
    of: { kind?: string; name?: string; caller?: string },
    units: [string, number][],
  ): void => {
    for (const [unit, limit] of units) {
      out ??= reserves()
      const reserved = out
        .filter(
          (one) =>
            (of.kind === undefined || one.kind === of.kind) &&
            (of.name === undefined || one.name === of.name) &&
            (of.caller === undefined || one.caller === of.caller),
        )
        .reduce((sum, one) => sum + one.seconds, 0)
      found.push({
        which,
        kind: work.kind,
        ...(of.name === undefined ? {} : { name: of.name }),
        ...(of.caller === undefined ? {} : { caller: of.caller }),
        unit,
        limit,
        used: usedToday(o, unit, of),
        reserved,
        atLimit: atLimitOf(limits),
      })
    }
  }
  add('kind', kindLimits, { kind: work.kind }, unitsOf(kindLimits.perDay))
  if (work.caller !== undefined)
    add('caller', kindLimits, { kind: work.kind, caller: work.caller }, unitsOf(kindLimits.perCallerPerDay))
  if (work.name !== undefined) add('definition', fnLimits, { name: work.name }, unitsOf(fnLimits.perDay))
  return found
}

/** The words of whose a limit is, as an error names it. */
const whoseOf = (one: LimitStanding): string =>
  one.which === 'kind'
    ? `the kind ${one.kind}`
    : one.which === 'caller'
      ? `the kind ${one.kind} for one caller`
      : `the definition ${one.name ?? ''}`

const limitName = (one: LimitStanding): string => (one.which === 'caller' ? 'perCallerPerDay' : 'perDay')

/** The error of work that a limit of use holds back: what was used and reserved, and the limit. */
export const limitRefusal = (one: LimitStanding): TentError =>
  new TentError(
    'T7102',
    `The work would pass the limit \`${limitName(one)}\` of ${one.limit} ${one.unit} of ${whoseOf(one)}: ${round(one.used)} were used today and ${round(one.reserved)} are reserved.`,
    {
      fields: { limit: limitName(one), unit: one.unit },
      fix: 'Wait for the work that is out to end, or for the next day, or raise the limit.',
    },
  )

/** The error of work whose own reserve is more than a limit of use: it can never go. */
export const neverFits = (one: LimitStanding, seconds: number): TentError =>
  new TentError(
    'T7102',
    `The work reserves ${round(seconds)} ${one.unit}, more than the limit \`${limitName(one)}\` of ${one.limit} of ${whoseOf(one)}.`,
    {
      fields: { limit: limitName(one), unit: one.unit },
      fix: 'State a shorter `reserve` or `time` of the work, or raise the limit.',
    },
  )

const round = (seconds: number): number => Math.round(seconds * 10) / 10

/**
 * Takes an app, a try that waits, and the reserves of the tasks that are out. Answers the first limit of use that
 * it would pass, with whether its own reserve alone passes it, or nothing where every limit lets it go.
 */
export function wouldPass(
  o: Opened,
  entry: InQueue,
  reserves: () => Reserve[],
): { standing: LimitStanding; never: boolean } | undefined {
  const { w } = entry
  const seconds = w.reserve / 1000
  const name = w.of === 'action' ? w.flow : undefined
  // The caller is read only where the kind holds each caller to a limit.
  const ofKind: unknown = Reflect.get(Object(Reflect.get(Object(o.description.project.workers), w.kind)), 'limits')
  const each = isStored(ofKind) && ofKind.perCallerPerDay !== undefined
  const caller = each ? { caller: machineCountedAs(o, w.kind, w.run).caller } : {}
  for (const one of limitsFor(o, { kind: w.kind, ...(name ? { name } : {}), ...caller }, reserves)) {
    if (seconds > one.limit) return { standing: one, never: true }
    if (one.used + one.reserved + seconds > one.limit) return { standing: one, never: false }
  }
  return undefined
}
