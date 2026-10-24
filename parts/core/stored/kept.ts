/**
 * Takes a record, and a name that a definition wrote. Answers what the record holds under the name as a member of
 * its own, and nothing for a name that it only has from the runtime, as `toString` and `__proto__`.
 */
export const keptAt = <Value>(record: Record<string, Value>, name: string): Value | undefined =>
  Object.hasOwn(record, name) ? record[name] : undefined

/**
 * Takes a record, a name that a definition wrote, and a value. Sets the value as a member of the record's own:
 * set plainly, the name `__proto__` would change what stands behind the record.
 */
export function keepAt(record: object, name: string, value: unknown): void {
  Object.defineProperty(record, name, { value, enumerable: true, writable: true, configurable: true })
}
