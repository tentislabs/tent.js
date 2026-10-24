import { mark } from '../mark.ts'

/** A guard of the engine's own, which only an engine that holds the rules of the tables can give. */
export interface OwnGuard {
  readonly guard: 'noOtherPeople' | 'noPersonal'
}

/** The guard that refuses an answer that names a row which the starter of the run may not read. */
export const noOtherPeople: OwnGuard = mark<OwnGuard>({ guard: 'noOtherPeople' })

/** The guard that refuses an answer that holds a personal value the starter may not read, or a private one. */
export const noPersonal: OwnGuard = mark<OwnGuard>({ guard: 'noPersonal' })
