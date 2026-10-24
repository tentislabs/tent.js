import type { ReadBody } from '../createEngine.ts'

// The reader of a sequence that each engine of the program was handed, by the token of the engine.
const held = new Map<string, ReadBody>()

/** Keeps the reader of a sequence that the program handed an engine. */
export const handReader = (token: string, reader: ReadBody): void => void held.set(token, reader)

/** Forgets the reader of an engine that closed. */
export const forgetReader = (token: string): void => void held.delete(token)

/** The reader of a sequence of an engine, where the program handed it one. */
export const sourceReaderOf = (token: string): ReadBody | undefined => held.get(token)
