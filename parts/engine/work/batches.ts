import type { Opened } from '../opened.ts'
import { fileRow } from '../stored/files.ts'
import type { InQueue } from './state.ts'

/**
 * What a definition states of its batches: how many entries at most, how long a batch that is not full waits, and
 * how much the input of one entry counts by `measure`, which is one where it states none.
 */
export interface BatchStated {
  max: number
  wait?: number
  measure?: string
  split?: boolean
  counted(input: unknown): number
}

/**
 * How much one value counts under `measure`: a number as itself, a file by its bytes, a text by its characters, a
 * list by its entries. A file is told by the type of its field, since its id is a text too.
 */
function measured(o: Opened, type: unknown, value: unknown): number {
  if (typeof value === 'number') return value
  if (Reflect.get(Object(type), 'kind') === 'file' && typeof value === 'string') return fileRow(o, value)?.size ?? 0
  if (typeof value === 'string' || Array.isArray(value)) return value.length
  return 1
}

/** What an action states of its batches, or nothing for one that states none. */
export function batchOf(o: Opened, flow: string): BatchStated | undefined {
  const record: unknown = Object.hasOwn(o.description.functions, flow) ? o.description.functions[flow] : undefined
  const stated: unknown = record === undefined ? undefined : Reflect.get(Object(record), 'batch')
  if (typeof stated !== 'object' || stated === null) return undefined
  const max = Reflect.get(stated, 'max')
  const wait = Reflect.get(stated, 'wait')
  const measure = Reflect.get(stated, 'measure')
  const type: unknown =
    typeof measure === 'string' ? Reflect.get(Object(Reflect.get(Object(record), 'input')), measure) : undefined
  return {
    max: typeof max === 'number' && max > 0 ? max : 1,
    ...(typeof wait === 'number' ? { wait } : {}),
    ...(typeof measure === 'string' ? { measure } : {}),
    ...(Reflect.get(stated, 'split') === true ? { split: true } : {}),
    counted: (input) => (typeof measure === 'string' ? measured(o, type, Reflect.get(Object(input), measure)) : 1),
  }
}

/**
 * Takes the first entry of a batch, the entries that wait behind it in order, what the definition states, the
 * input of a run, and the most a task may hold. Answers the entries of the batch: the first and those of the same
 * definition and version behind it, up to `max`, or the most of the sum of `measure`, and no further than the size
 * of a task. One entry that passes `max` alone is a batch of its own.
 */
export function gathered(
  first: InQueue,
  waiting: InQueue[],
  stated: BatchStated,
  inputOf: (run: string) => unknown,
  taskSize: number,
): InQueue[] {
  const counted = (entry: InQueue): number => stated.counted(inputOf(entry.w.run))
  const batch = [first]
  let sum = counted(first)
  let size = JSON.stringify(inputOf(first.w.run) ?? null).length
  for (const entry of waiting) {
    if (entry === first || entry.w.flow !== first.w.flow || entry.w.version !== first.w.version) continue
    const more = counted(entry)
    const bytes = JSON.stringify(inputOf(entry.w.run) ?? null).length
    if (sum + more > stated.max || size + bytes > taskSize) break
    batch.push(entry)
    sum += more
    size += bytes
  }
  return batch
}
