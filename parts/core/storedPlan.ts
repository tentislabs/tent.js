import type { Plan } from './description.ts'
import { isStored } from './record.ts'

/** Whether a stored value is a plan: the one record of a filter, a query or a read that names the table it reads. */
export const isPlan = (value: unknown): value is Plan => isStored(value) && typeof value.from === 'string'
