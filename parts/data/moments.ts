import type { ColumnType } from './store.ts'

/** Whether a value of this type holds a moment somewhere inside it, which JSON text keeps as text. */
export const holdsMoment = (type: ColumnType): boolean =>
  type.kind === 'date' ||
  (type.kind === 'list' && holdsMoment(type.of)) ||
  (type.kind === 'object' && Object.values(type.shape).some(holdsMoment))

/** Gives a value that was read from JSON text its moments back, by its type. */
export function withMoments(type: ColumnType, value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (type.kind === 'date') return typeof value === 'string' ? new Date(value) : value
  if (type.kind === 'list' && Array.isArray(value)) return value.map((entry) => withMoments(type.of, entry))
  if (type.kind === 'object' && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([name, entry]) => [
        name,
        Object.hasOwn(type.shape, name) ? withMoments(type.shape[name], entry) : entry,
      ]),
    )
  return value
}
