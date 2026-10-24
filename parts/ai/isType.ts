import type { Type } from '../core/index.ts'
import { isStored } from '../core/internal.ts'

/** Whether a value is a type as it is stored: a record that names its kind. */
export const isType = (value: unknown): value is Type => isStored(value) && typeof value.kind === 'string'
