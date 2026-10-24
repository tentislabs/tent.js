import { isStored } from '../../core/internal.ts'
import { textOf } from '../compare/records.ts'
import { taken } from '../compare/steps.ts'
import { mergeLines } from './lines.ts'
import type { FieldApart } from './values.ts'

const same = (a: unknown, b: unknown): boolean => textOf(a) === textOf(b)

/** Whether a value is the place that a step of that name was taken out of. */
const isPlace = (value: unknown, step: string): boolean =>
  isStored(value) && Object.keys(value).length === 1 && value.step === step

/** Whether the body around holds the place of a step. */
function holds(around: unknown, step: string): boolean {
  if (isPlace(around, step)) return true
  if (Array.isArray(around)) return around.some((one) => holds(one, step))
  return isStored(around) && Object.values(around).some((one) => holds(one, step))
}

/** The names that a stored value reads first: the first word of each name in it. */
function namesRead(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const one of value) namesRead(one, found)
  else if (isStored(value)) {
    if (Array.isArray(value.name) && typeof value.name[0] === 'string') found.add(value.name[0])
    for (const one of Object.values(value)) namesRead(one, found)
  }
  return found
}

/**
 * Takes a body around its steps, the name of a step and a name it reads. Answers, as text, what gives that name at
 * the place of the step: the `const` that names it, the head of the repeat whose name it is, or the arrow that is
 * handed it, the nearest one. `none` where nothing of the body gives it.
 */
function giverAt(around: unknown, step: string, name: string): string {
  let found = 'none'
  const visit = (value: unknown, givers: ReadonlyMap<string, string>): boolean => {
    if (isPlace(value, step)) {
      found = givers.get(name) ?? 'none'
      return true
    }
    const local = new Map(givers)
    if (Array.isArray(value)) {
      for (const one of value) {
        if (visit(one, local)) return true
        // A `const` gives its names to what stands after it in its block.
        const named = isStored(one) ? one.const : undefined
        for (const given of Array.isArray(named) ? named : [named])
          if (typeof given === 'string') local.set(given, textOf(one))
      }
      return false
    }
    if (!isStored(value)) return false
    if (typeof value.for === 'string') local.set(value.for, textOf({ for: value.for, of: value.of }))
    if (Array.isArray(value.arrow))
      for (const given of value.arrow) if (typeof given === 'string') local.set(given, textOf({ arrow: value.arrow }))
    return Object.values(value).some((one) => visit(one, local))
  }
  visit(around, new Map())
  return found
}

/**
 * Merges three bodies around their steps that both sides changed, statement by statement as text is merged line by
 * line: a run of statements that only one side changed is taken from it, and where both changed the same
 * statements, a repeat or a choice that both hold is merged inside its blocks. Answers the merged list, or nothing
 * where both changed one statement otherwise.
 */
function mergeStatements(base: unknown, ours: unknown, theirs: unknown): unknown[] | undefined {
  if (!Array.isArray(base) || !Array.isArray(ours) || !Array.isArray(theirs)) return undefined
  const byText = new Map<string, unknown>()
  const textsOf = (list: unknown[]): string[] =>
    list.map((one) => {
      const text = textOf(one)
      byText.set(text, one)
      return text
    })
  const merged = mergeLines(textsOf(base), textsOf(ours), textsOf(theirs))
  const out: unknown[] = merged.lines.map((text) => byText.get(text))
  for (const place of [...merged.apart].reverse()) {
    const [b, m, y] = [place.base, place.ours, place.theirs].map((list) => list.map((text) => byText.get(text)))
    const inner = m.length === 1 && y.length === 1 && b.length === 1 ? mergeBlocks(b[0], m[0], y[0]) : undefined
    if (inner === undefined) return undefined
    out.splice(place.at, place.count, inner)
  }
  return out
}

/** Merges one repeat or one choice that both sides changed, inside its blocks, where its head is the same on all three. */
function mergeBlocks(base: unknown, ours: unknown, theirs: unknown): unknown {
  if (!isStored(base) || !isStored(ours) || !isStored(theirs)) return undefined
  const blocks = ['do', 'then', 'else']
  const head = (one: Record<string, unknown>): string =>
    textOf(Object.fromEntries(Object.entries(one).filter(([key]) => !blocks.includes(key))))
  if (head(base) !== head(ours) || head(base) !== head(theirs)) return undefined
  const merged: Record<string, unknown> = { ...ours }
  for (const key of blocks) {
    if (!Array.isArray(ours[key]) && !Array.isArray(theirs[key])) continue
    const inside = mergeStatements(base[key] ?? [], ours[key] ?? [], theirs[key] ?? [])
    if (inside === undefined) return undefined
    merged[key] = inside
  }
  return merged
}

/** Puts the stored call of each step back where its name stands in the body around. */
function putBack(around: unknown, steps: ReadonlyMap<string, unknown>): unknown {
  if (isStored(around) && Object.keys(around).length === 1 && typeof around.step === 'string')
    return steps.get(around.step) ?? around
  if (Array.isArray(around)) return around.map((one) => putBack(one, steps))
  if (isStored(around))
    return Object.fromEntries(Object.entries(around).map(([key, one]) => [key, putBack(one, steps)]))
  return around
}

/**
 * Merges the three bodies of one option of a definition, as compare tells them apart: the body around its steps
 * is taken from the side that changed it, and each step from the side that changed it. A clash is added to
 * `apart`: both changed the body around, both changed a step to different forms, one changed a step that the
 * merged body around no longer holds, or a step taken from one side reads a name that the merged body around
 * gives otherwise than that side. `front` stands before the name of a step in its path. Answers the merged body.
 */
export function mergeBody(
  base: unknown,
  ours: unknown,
  theirs: unknown,
  apart: FieldApart[],
  o: { option: string; owner: string; front: string },
): unknown {
  const [was, mine, yours] = [taken(base ?? []), taken(ours ?? []), taken(theirs ?? [])]
  const before = apart.length
  let around = mine.around
  if (!same(mine.around, yours.around) && !same(was.around, yours.around)) {
    if (same(was.around, mine.around)) around = yours.around
    else {
      const merged = mergeStatements(was.around, mine.around, yours.around)
      if (merged === undefined) apart.push({ path: [o.option], ours, theirs, base })
      else around = merged
    }
  }
  const steps = new Map<string, unknown>()
  const sideOf = new Map<string, unknown>()
  for (const name of new Set([...was.steps.keys(), ...mine.steps.keys(), ...yours.steps.keys()])) {
    const [b, m, y] = [was.steps.get(name), mine.steps.get(name), yours.steps.get(name)]
    const what = { what: 'step', name: `${o.owner}.${o.front}${name}` }
    if (same(m, y) || same(b, y)) {
      if (m !== undefined) steps.set(name, m)
      if (!same(b, m)) sideOf.set(name, mine.around)
    } else if (same(b, m)) {
      if (y !== undefined) steps.set(name, y)
      sideOf.set(name, yours.around)
    } else apart.push({ ...what, path: [o.option, name], ours: m, theirs: y, base: b })
  }
  for (const [name, side] of sideOf) {
    const what = { what: 'step', name: `${o.owner}.${o.front}${name}` }
    const value = steps.get(name)
    if (value === undefined) continue
    if (!holds(around, name)) {
      apart.push({
        ...what,
        path: [o.option, name],
        ours: mine.steps.get(name),
        theirs: yours.steps.get(name),
        base: was.steps.get(name),
      })
      continue
    }
    for (const read of namesRead(value))
      if (giverAt(side, name, read) !== giverAt(around, name, read)) {
        apart.push({
          ...what,
          path: [o.option, name, read],
          ours: mine.steps.get(name),
          theirs: yours.steps.get(name),
          base: was.steps.get(name),
        })
        break
      }
  }
  return apart.length > before ? ours : putBack(around, steps)
}
