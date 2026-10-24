/** A record as it is stored: plain data by the names of its fields. */
export type Stored = Record<string, unknown>

/** Whether a value is a record that is no list. */
export const isStored = (value: unknown): value is Stored =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Whether a value is a record of fields: no list, and no moment, which the runtime holds as an object too. */
export const isFields = (value: unknown): value is Stored => isStored(value) && !(value instanceof Date)
