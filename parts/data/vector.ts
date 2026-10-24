import { TentError } from '../core/index.ts'

const notValid = (table: string, column: string, why: string): TentError =>
  new TentError('T2105', `The vector of \`${column}\` of \`${table}\` ${why}.`, {
    fields: { [column]: 'type' },
    fix: 'Give a list of finite numbers, as many as the `size` of the column.',
  })

/**
 * Takes a value, how many numbers the column holds, and the names of the table and the column. Answers the value
 * as a vector is kept: numbers of 32 bits. It takes a list of numbers, and numbers of 32 bits as they are kept.
 * Throws T2105 for what is neither, for a list of another
 * length, and for a number that is not finite, or that 32 bits cannot hold.
 */
export function vectorOf(value: unknown, size: number, table: string, column: string): Float32Array {
  // A sink is handed a vector as numbers of 32 bits, and hands it back so.
  if (!Array.isArray(value) && !(value instanceof Float32Array)) throw notValid(table, column, 'is no list of numbers')
  if (value.length !== size)
    throw notValid(table, column, `holds ${value.length} numbers, and the column takes ${size}`)
  const made = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    const one: unknown = value[i]
    if (typeof one !== 'number' || !Number.isFinite(one))
      throw notValid(table, column, 'holds what is no finite number')
    made[i] = one
    if (!Number.isFinite(made[i])) throw notValid(table, column, 'holds a number that 32 bits cannot hold')
  }
  return made
}

/** Throws T2105 for a vector whose numbers are all zero: it has no direction, so nothing is near it by the cosine. */
export function withDirection(vector: Float32Array, table: string, column: string): void {
  if (vector.every((one) => one === 0))
    throw notValid(table, column, "holds zeros alone, and has no direction for a `near` with 'cosine'")
}

// A vector is stored as raw bytes, four for each number, lowest byte first: every system the runtime is shipped for
// keeps a number of 32 bits that way in memory, so the bytes of the list are the stored bytes.

/** Answers the bytes a vector is stored as. */
export const vectorBytes = (vector: Float32Array): Uint8Array =>
  new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength)

/** Answers the vector that stored bytes hold, in memory of its own. */
export const vectorFrom = (bytes: Uint8Array): Float32Array => new Float32Array(bytes.slice().buffer)
