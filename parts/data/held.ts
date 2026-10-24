/**
 * Takes a value and a name. Answers what the value holds under that name where it is a record, and nothing for
 * any other value: what a store answers, and what JSON held, is of no known shape until it is read so.
 */
export function heldIn(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined
  const held: unknown = Reflect.get(value, name)
  return held
}
