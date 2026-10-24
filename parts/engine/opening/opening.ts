import { mkdirSync } from 'node:fs'
import type { App } from '../app.ts'
import type { EngineFileBegun } from '../engineFile.ts'
import { beginEngineFile } from '../engineFile.ts'
import type { Opened } from '../opened.ts'
import { makersFor } from '../ownMakers.ts'
import { holdOf } from '../rooms/hold.ts'
import { makeRoom } from '../rooms/makeRoom.ts'
import type { Room } from '../rooms/room.ts'
import { openData } from './data.ts'
import type { UnderWay, Opening, Program } from './frame.ts'
import { frameOf } from './frame.ts'
import { placed } from './placed.ts'
import { whileAgain } from '../reopening.ts'
import { started } from './started.ts'
import { finishKeyReplaced } from '../values/replaceKey.ts'

/**
 * Takes what the engine hands an opening, what the opening worked on, the app as it is open, and the folder of
 * another version. Closes the app and opens it on that version as the same app, with what the makers of that
 * version make. Where it does not open, it is opened on the version it ran, and the error is thrown.
 */
async function openedAgain(program: Program, w: Opening, o: Opened, app: App, bundleFolder: string): Promise<void> {
  const { claimed, closeApp, readBundle } = await import('../open.ts')
  await closeApp(o)
  const anew = async (folder: string): Promise<void> => {
    const { release } = await claimed(w.dataFolder, 'engine.open')
    const { description, version } = readBundle(folder)
    try {
      await opening(program, { ...w, bundleFolder: folder, description, version, app })
    } catch (error) {
      release()
      throw error
    }
  }
  try {
    await anew(bundleFolder)
  } catch (error) {
    await anew(w.bundleFolder)
    throw error
  }
}

/**
 * Takes what the engine hands an opening, and what the opening works on, with its data folder held for this
 * program. Has the makers make the store and the clock of the app, opens its data, and for a writer applies the
 * table changes; loads its code, makes the app the writer or a reader of its data, and writes `engine.json`.
 * Answers the app. Where anything fails, everything that the opening started is taken back, from the last, the
 * app is marked closed, and the error is thrown: the folder is still held.
 */
export async function opening(program: Program, w: Opening): Promise<App> {
  let frame: UnderWay | undefined
  let room: Room | undefined
  let engineFile: EngineFileBegun | undefined
  try {
    mkdirSync(w.dataFolder, { recursive: true })
    // `engine.json` is begun first, so that its rights are closed beside the opening, which writes it at its end.
    engineFile = beginEngineFile(w.dataFolder)
    // A new key that a stopped run of the command left beside the key is put in its place before the data is opened.
    if (!w.told.reads) await finishKeyReplaced(w.dataFolder)
    // The room of the app, which the program or this opening makes, and never the bundle; then the makers of the
    // app: those of `engine.ts` of its bundle, loaded by the room, under those of the program and of this opening.
    const hold = holdOf(w.description)
    const where = {
      app: w.description.app.name,
      dataFolder: w.dataFolder,
      mode: w.mode,
      where: 'main' as const,
      ...(hold === undefined ? {} : { hold }),
    }
    room = makeRoom(w.makers?.room ? w.makers : program.makers, where)
    const makers = await makersFor(program.makers, w, room)
    frame = await frameOf({ ...program, makers }, w, room)
    const data = await openData(frame)
    await placed(frame, data)
    const app = await started(frame, data, engineFile)
    const { o } = frame
    // A call that arrives while the app is opened again waits for the new opening.
    o.again = (bundleFolder) => whileAgain(o, app, () => openedAgain(program, w, o, app, bundleFolder))
    return app
  } catch (error) {
    // A timer of the app that still falls due sees that the app is gone.
    if (frame) frame.o.closed = true
    for (const back of (frame?.started ?? []).reverse())
      try {
        await back()
      } catch {
        // What could not be taken back is left: the error that stopped the opening is the one that is told.
      }
    engineFile?.drop()
    // A room that a failed opening made holds nothing from here on.
    await room?.close()
    throw error
  }
}
