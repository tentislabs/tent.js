import { TentError } from '../../core/index.ts'
import type { Mode } from '../../data/index.ts'
import type { Makers } from '../makers.ts'
import { heldRoom } from './held/room.ts'
import { inProgramRoom } from './inProgram/room.ts'
import type { Hold, Room, RoomInput } from './room.ts'
import { waysOf } from './ways.ts'

/**
 * Takes the makers of the program and of the opening, and what the room serves: the app, its data folder, its
 * mode, the thread or machine, and the `hold` its project states. Answers the app's room there: the one the
 * program's `room` makes, handed the engine's side of `ways` for its calls, and where it gives none the held room
 * for a project that states `hold`, or the room of the program.
 */
export function makeRoom(
  makers: Pick<Makers, 'room'> | undefined,
  o: { app: string; dataFolder: string; mode: Mode; where: RoomInput['where']; hold?: Hold },
): Room {
  let made: Room | undefined
  const ways = waysOf(() => {
    if (!made) throw new TentError('T0013', 'The room asked the engine for a call before it was made.')
    return made
  })
  const input: RoomInput = { app: o.app, dataFolder: o.dataFolder, mode: o.mode, where: o.where, ways }
  made = makers?.room?.(input) ?? (o.hold === undefined ? inProgramRoom(input) : heldRoom(input))
  return made
}
