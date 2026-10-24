import type { Description } from '../../core/internal.ts'
import type { Change } from '../../history/index.ts'
import { changesOf } from '../../history/index.ts'
import { breaks } from '../breaks.ts'
import { dataOf } from './data.ts'
import type { ImpactLine, Impact, ImpactFacts } from './face.ts'
import { outOf } from './out.ts'
import { countOf, reachedBy } from './reaches.ts'
import { fileOf, kindOf, wholeOf } from './read.ts'
import { widerRights } from './rights.ts'
import { workOf } from './work.ts'

/** An impact in which nothing changed, against what it names. */
export const noImpact = (against: string): Impact => ({
  against,
  rights: [],
  breaks: [],
  data: [],
  work: [],
  reaches: [],
  tests: [],
  untested: [],
  out: [],
})

/** A change that breaks a caller outside, in words. */
function brokenBy(change: Change): string {
  const path = (change.path ?? []).join('.')
  if (change.change === 'removed') return 'removed'
  if (path === 'offer')
    return `no longer offered to ${[change.from]
      .flat()
      .filter((one) => ![change.to].flat().includes(one))
      .join(', ')}`
  if (path === 'access') return `rule narrowed ${String(change.from)} -> ${String(change.to)}`
  if (path.startsWith('input.'))
    return change.to === 'required'
      ? `${path} became required`
      : `${path} ${String(change.from)} -> ${String(change.to)}`
  if (path.startsWith('output.')) return `${path} is no longer given`
  return `${path} changed`
}

/** The definitions that a change names: a column and a step by the name of their own, and the rest by theirs. */
const namesOf = (changes: Change[]): string[] => [...new Set(changes.map((one) => one.name))]

/**
 * Takes what a change is held against, the description that runs, the one that would follow it, and what the
 * running app tells of itself. Answers what the change will reach before it lands, read from the two descriptions
 * alone, the weightiest part first: wider rights, breaks for callers outside with their callers, data, work under
 * way, what each changed definition reaches, the tests that touched each in their last run and what no test
 * touches, and what now sends out or asks a person no more. A part where nothing changed is empty.
 */
export function impactOf(o: { against: string; live: Description; next: Description; facts?: ImpactFacts }): Impact {
  const [live, next] = [wholeOf(o.live), wholeOf(o.next)]
  const facts = o.facts ?? {}
  const changes = changesOf(live, next)
  const reachesOf = (name: string): number => {
    const counted = countOf(reachedBy(next, name))
    return counted.functions + counted.screens
  }
  const withReach = (one: ImpactLine): ImpactLine => {
    const reaches = reachesOf(one.name)
    return reaches ? { ...one, reaches } : one
  }
  const breaking: ImpactLine[] = breaks(live, next).map((change) => {
    const callers = facts.callers?.[change.name]
    const side = change.change === 'removed' ? live : next
    return {
      name: change.name,
      kind: change.what,
      file: fileOf(side, change.name),
      change: brokenBy(change),
      ...(callers ? { callers } : {}),
    }
  })
  const changed = namesOf(changes)
  const reaches = changed.flatMap((name) => {
    const tree = reachedBy(next, name)
    return tree.length ? [{ name, tree }] : []
  })
  // The tests of each changed definition, by what each test touched in its last run.
  const touched = Object.entries(facts.touched ?? {})
  const definitions = changed.filter(
    (name) => kindOf(next, name.split('.')[0]) !== 'definition' || kindOf(live, name.split('.')[0]) !== 'definition',
  )
  const tests = definitions.flatMap((name) => {
    const by = touched
      .filter(([, names]) => names.includes(name.split('.')[0]))
      .map(([test]) => test)
      .sort()
    return by.length ? [{ name, tests: by }] : []
  })
  const untested = definitions.filter((name) => !tests.some((one) => one.name === name))
  return {
    against: o.against,
    rights: widerRights(live, next).map(withReach),
    breaks: breaking.map(withReach),
    data: dataOf(live, next, changes, facts).map(withReach),
    work: workOf(live, next, changes, facts),
    reaches,
    tests,
    untested,
    out: outOf(live, next),
  }
}
