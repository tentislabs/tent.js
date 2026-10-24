import { TentError } from '../../core/index.ts'
import { msOf } from '../words.ts'
import type { CountBy } from './by.ts'

/** What a host opened an app with for its counts: each in milliseconds where it is a length of time. */
export interface OpenCounting {
  countBy?: CountBy
  countEvery?: number
  levelEvery?: number
  callerCountsKept?: number
  countsKept?: number
}

/** What `engine.open` takes for the counts of the app it opens, each length of time in words. */
export interface CountingOptions {
  countBy?: CountBy
  countEvery?: string
  levelEvery?: string
  callerCountsKept?: string
  countsKept?: string
}

/**
 * Reads what `engine.open` was handed for the counts, and nothing where it was handed none. Throws T0013 for a way of
 * counting that is none of the three, and for a length of time that does not read.
 */
export function countingOf(o: CountingOptions): OpenCounting | undefined {
  if (o.countBy !== undefined && !['limits', 'app', 'caller'].includes(o.countBy))
    throw new TentError(
      'T0013',
      `\`countBy\` of \`engine.open\` is 'limits', 'app' or 'caller', and not ${String(o.countBy)}.`,
    )
  const length = (name: keyof CountingOptions): Record<string, number> => {
    const words = o[name]
    return words === undefined || name === 'countBy' ? {} : { [name]: msOf(name, words, 1) }
  }
  const read: OpenCounting = {
    ...(o.countBy === undefined ? {} : { countBy: o.countBy }),
    ...length('countEvery'),
    ...length('levelEvery'),
    ...length('callerCountsKept'),
    ...length('countsKept'),
  }
  return Object.keys(read).length ? read : undefined
}
