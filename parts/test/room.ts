import type { Makers } from '../engine/index.ts'
import { apartRoom } from '../engine/index.ts'

/** Where a test app's code runs: the room of the program, or the framework's test room, which crosses every call. */
export type TestRoom = 'program' | 'apart'

/**
 * Takes the room a test asked for, where it asked for one. Answers the maker of the room that the engines of the
 * test app are handed: the test room where the test asks for `apart`, or where it asks for none and the run states
 * `TENT_ROOM=apart`; and none, the room of the program, otherwise.
 */
export function roomMaker(asked?: TestRoom): Makers['room'] {
  const room = asked ?? (process.env.TENT_ROOM === 'apart' ? 'apart' : 'program')
  return room === 'apart' ? apartRoom : undefined
}
