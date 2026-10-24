// biome-ignore lint/suspicious/noExplicitAny: the borrowed part hands back a value it gives no type
export const loose = (value: any): string => String(value)
// @ts-ignore
export const count: number = 'three'
// @ts-expect-error
export const size: number = 'small'
/* @ts-nocheck */
export const last = true
