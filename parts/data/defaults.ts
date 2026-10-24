import { dayOf } from '../core/index.ts'
import type { ColumnType } from './store.ts'

/**
 * Takes the type of a column, the moment of a write, and the zone of the project. Answers what the default of the
 * column is at that moment, where it is worked out from the moment: the moment itself for `now`, and its day in the
 * zone for `today`. Nothing for a column with any other default, or with none. Where no zone is handed, the day is
 * that of the zone the default itself names, as a layout holds it.
 */
export function momentDefault(type: ColumnType, at: number, zone?: string): Date | string | undefined {
  const stored: unknown = 'default' in type ? type.default : undefined
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return undefined
  if ('now' in stored) return new Date(at)
  if (!('today' in stored)) return undefined
  const named = 'zone' in stored && typeof stored.zone === 'string' ? stored.zone : 'UTC'
  return dayOf(new Date(at), zone ?? named)
}
