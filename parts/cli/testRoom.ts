/**
 * Takes the room that `tent test --room` names, where it names one. States it for the run of the tests, which
 * `testApp` reads as `TENT_ROOM`: `apart`, the test room, which crosses every call, or `program`, the room of the
 * program. Answers what states again what stood before, once the run has ended.
 */
export function roomOfRun(room: unknown): () => void {
  if (room !== 'apart' && room !== 'program') return () => undefined
  const before = process.env.TENT_ROOM
  if (room === 'apart') process.env.TENT_ROOM = 'apart'
  else delete process.env.TENT_ROOM
  return () => {
    if (before === undefined) delete process.env.TENT_ROOM
    else process.env.TENT_ROOM = before
  }
}
