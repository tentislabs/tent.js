import { written } from '../write.ts'

/** Writes a value into the words of a finding, whatever it is: as JSON, with what JSON cannot write as text. */
export const shownAs = (value: unknown): string => written(value, undefined)
