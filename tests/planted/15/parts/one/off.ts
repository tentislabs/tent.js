// biome-ignore lint/suspicious/noExplicitAny: a rule of the linter, switched off outside a wrapper
export const loose = (value: any): string => String(value)
// @ts-ignore
export const count: number = 'three'
// @ts-expect-error
export const size: number = 'small'
/* @ts-nocheck */
export const last = true
