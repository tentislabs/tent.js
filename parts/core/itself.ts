import { TentError } from './errors.ts'

/** How many lists and objects may stand inside each other in a value that is stored or checked. */
const deepest = 200

/** How many values a thing that stands in many places may be stored as, each place counted. */
const largest = 1_000_000

/** What no stored form can hold of a value: the way to the place, by the names and the numbers on it, and the words for it. */
export interface Fault {
  at: string
  why: 'itself' | 'deep' | 'large' | 'kind'
  words: string
}

/**
 * What a walk asks of each thing it meets, with what holds the thing and the name it stands under there. It
 * answers the list or the object that the walk steps through, nothing for a thing that is taken as it is, or the
 * words for a thing that no stored form holds.
 */
export type Seeing = (one: unknown, holder: object | undefined, name: string) => object | string | undefined

/** One list or object that the walk stands in: what it steps through, how far it has come, and its name where it stands. */
interface Step {
  held: object
  through: object
  names: string[] | undefined
  length: number
  next: number
  name: string
  // How many lists and objects stand inside each other below this one, itself counted, and how many values it holds.
  tall: number
  size: number
}

function stepOf(held: object, through: object, name: string): Step {
  const names = Array.isArray(through) ? undefined : Object.keys(through)
  const length: number = names ? names.length : Reflect.get(through, 'length')
  return { held, through, names, length, next: 0, name, tall: 1, size: 1 }
}

const everyObject: Seeing = (one) => (typeof one === 'object' && one !== null ? one : undefined)

const wordsOf = {
  itself: 'holds itself',
  large: `stands in so many places that it would be stored as more than ${largest} values`,
}

/**
 * The one home of a walk into a value that was written. Takes a value; `see`, which says of each thing whether
 * the walk steps into it, takes it or refuses it, and steps into every list and every object where none is handed;
 * and how deep the value itself stands, 1 where it is the value that was written and 0 where it is what holds such
 * values. Answers the first place that no stored form holds: a thing that `see` refuses, a place that is nested
 * more than 200 deep, a thing that stands in so many places that it would be stored as more than 1,000,000
 * values, or else the first place where the value holds itself. It keeps a list of its own of where it stands, so
 * it calls nothing inside itself, and a value of any depth is walked. What stands in many places is walked once,
 * and counted where it stands deepest. `most` is how deep a value may be where it is not 200: a description is
 * deeper than the values in it.
 */
export function faultOf(value: unknown, see: Seeing = everyObject, start = 1, most = deepest): Fault | undefined {
  const first = see(value, undefined, '')
  if (typeof first === 'string') return { at: '', why: 'kind', words: first }
  if (typeof value !== 'object' || value === null || !first) return undefined
  const above = new Set<object>([value])
  const ended = new Map<object, Step>()
  const steps: Step[] = [stepOf(value, first, '')]
  // The way to a place is written out only for a fault: most values have none.
  const fault = (name: string, why: Fault['why'], words: string): Fault => ({
    at: [...steps.slice(1).map((step) => step.name), name].join('.'),
    why,
    words,
  })
  const deep = `is nested more than ${most} deep`
  let itself: Fault | undefined
  let shared = 0
  while (steps.length) {
    const step = steps[steps.length - 1]
    if (step.next >= step.length) {
      steps.pop()
      above.delete(step.held)
      ended.set(step.held, step)
      const holder = steps[steps.length - 1]
      if (holder) {
        if (step.tall >= holder.tall) holder.tall = step.tall + 1
        holder.size += step.size
      }
      continue
    }
    const name = step.names ? step.names[step.next] : String(step.next)
    const one: unknown = Reflect.get(step.through, name)
    step.next++
    step.size++
    if (one === undefined || one === null || typeof one === 'string' || typeof one === 'boolean') continue
    const through = see(one, step.held, name)
    if (typeof through === 'string') return fault(name, 'kind', through)
    if (!through || typeof one !== 'object') continue
    if (above.has(one)) {
      itself ??= fault(name, 'itself', wordsOf.itself)
      continue
    }
    const depth = steps.length + start
    const seen = ended.get(one)
    if (seen) {
      // It stands in a second place: it is not walked again, and counts for what it was found to be.
      if (depth + seen.tall - 1 > most) return fault(name, 'deep', deep)
      shared += seen.size
      if (shared > largest) return fault(name, 'large', wordsOf.large)
      if (seen.tall >= step.tall) step.tall = seen.tall + 1
      step.size += seen.size
      continue
    }
    if (depth > most) return fault(name, 'deep', deep)
    above.add(one)
    steps.push(stepOf(one, through, name))
  }
  return itself
}

/**
 * Throws T1014 for a value that has a fault: no stored form holds it. Every walk that stores a value follows
 * this. `see` says what the walk steps into, as `faultOf` takes it: every list and every object where none is
 * handed.
 */
export function refuseFault(value: unknown, see: Seeing = everyObject): void {
  const fault = faultOf(value, see)
  if (!fault) return
  const words: Record<Fault['why'], string> = {
    itself: 'A value that holds itself cannot be stored.',
    deep: `A value that is nested more than ${deepest} deep cannot be stored.`,
    large: `A value that would be stored as more than ${largest} values cannot be stored.`,
    kind: 'A value of that kind cannot be stored.',
  }
  throw new TentError('T1014', words[fault.why], {
    fix: `Write the value so that no list and no object in it holds itself, and none stands more than ${deepest} deep.`,
  })
}
