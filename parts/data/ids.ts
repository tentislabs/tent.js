import { randomFillSync } from 'node:crypto'

const letters = '0123456789abcdefghjkmnpqrstvwxyz'

// Two characters for each number of ten bits, so that an id is written with thirteen reads of a list.
const pairs: string[] = Array.from({ length: 1024 }, (_, n) => letters[n >> 5] + letters[n & 31])

const two20 = 2 ** 20
const two22 = 2 ** 22
const two24 = 2 ** 24
const two34 = 2 ** 34
const two40 = 2 ** 40

const idForm = /^[0-9a-hjkmnp-tv-z]{26}$/

/** Whether a value is written as the id of a row is: 26 characters of the letters of an id. */
export const isId = (value: unknown): value is string => typeof value === 'string' && idForm.test(value)

/** Writes a number of twenty bits as four characters. */
const four = (n: number): string => pairs[n >> 10] + pairs[n & 1023]

/** Writes a number of forty bits as eight characters. */
const eight = (n: number): string => four(Math.floor(n / two20)) + four(n % two20)

/** Reads characters of an id as one number, or nothing where one of them is no letter of an id. */
function read(text: string): number | undefined {
  let n = 0
  for (const letter of text) {
    const value = letters.indexOf(letter)
    if (value < 0) return undefined
    n = n * 32 + value
  }
  return n
}

/** What makes ids: `next` answers a new one, and `above` moves the maker past an id that is already held. */
export interface IdMaker {
  next(): string
  above(id: string): void
}

/**
 * Takes a clock, and a source of random numbers from 0 up to 1 where the random source of the runtime is not the
 * one: the clock and the source of an app. Answers a maker of row ids: a version-7 unique id, 48 bits of time and then
 * random bits, written in 26 characters with two zero bits in front. Each id is larger than the one before it, also
 * within one millisecond and when the clock steps back, so the order of the ids is the order in which they were made.
 */
export function idMaker(now: () => number = () => Date.now(), random?: () => number): IdMaker {
  // The last id: its time, and its 74 random bits as the upper 34 and the lower 40.
  let time = 0
  let high = 0
  let low = 0
  const drawn = new Uint8Array(4096)
  let used = drawn.length

  /** Answers a random number of so many bytes, five at most. */
  const draw = (bytes: number): number => {
    let n = 0
    // A source of the app's own is drawn from as each id needs it, so that its numbers follow one order.
    if (random) {
      for (let i = 0; i < bytes; i++) n = n * 256 + Math.floor(random() * 256)
      return n
    }
    if (used + bytes > drawn.length) {
      randomFillSync(drawn)
      used = 0
    }
    for (let i = 0; i < bytes; i++) n = n * 256 + drawn[used++]
    return n
  }
  const fresh = () => {
    high = draw(5) % two34
    low = draw(5)
  }

  return {
    next() {
      const at = now()
      if (at > time) {
        time = at
        fresh()
      } else {
        // The same millisecond, or a clock that stepped back: the last id is moved on by a random step.
        low += 1 + draw(4)
        if (low >= two40) {
          low -= two40
          high += 1
        }
        if (high >= two34) {
          time += 1
          fresh()
        }
      }
      // The version, 7, stands before the upper twelve random bits, and the variant, 2, before the others.
      const middle = 7 * 2 ** 36 + Math.floor(high / two22) * two24 + 2 * two22 + (high % two22)
      return eight(Math.floor(time / 1024)) + pairs[time % 1024] + eight(middle) + eight(low)
    },
    above(id) {
      if (id.length !== 26) return
      const [at, middle, last] = [read(id.slice(0, 10)), read(id.slice(10, 18)), read(id.slice(18))]
      if (at === undefined || middle === undefined || last === undefined) return
      const upper = (Math.floor(middle / two24) % 4096) * two22 + (middle % two22)
      if (at < time || (at === time && (upper < high || (upper === high && last <= low)))) return
      time = at
      high = upper
      low = last
    },
  }
}

// The maker of the program, of what no app's own maker makes: an app makes the ids of its rows with its own.
export const rowIds = idMaker()
