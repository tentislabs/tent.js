import { TentError } from '../core/index.ts'
import { bytesAt } from './files.ts'
import type { Makers } from './makers.ts'
import type { Opening } from './opening/frame.ts'
import { callCrossed } from './rooms/calls.ts'
import { placedVersion } from './rooms/inProgram/loader.ts'
import type { Room } from './rooms/room.ts'

// The makers that `engine.ts` may give, by their names: each is an entry of its default export.
const makerNames = [
  'store',
  'lease',
  'clock',
  'files',
  'mailer',
  'textReaders',
  'search',
  'changes',
  'workers',
  'signers',
  'verifiers',
  'providers',
  'drivers',
  'sandbox',
] as const

/**
 * Takes what an opening works on and the room of the app. Answers the makers that `engine.ts` of the bundle gives,
 * loaded by the room from the module that the description names as `server.makers`, each an entry of the room, or
 * none for a bundle that has no such file. Throws T0011 for a module that cannot be loaded, and for one that gives
 * `room`: the code of an app never chooses its own walls.
 */
async function bundleMakers(w: Opening, room: Room): Promise<Makers> {
  const module: unknown = Reflect.get(Object(Reflect.get(w.description, 'server')), 'makers')
  if (typeof module !== 'string') return {}
  const version = { id: w.version, modules: [{ path: module, kinds: ['maker' as const] }] }
  const bundle = w.bundleFolder
  await room.load(placedVersion({ ...version, read: (path) => bytesAt(bundle, path) }, bundle))
  const made = (name: string): ((input: unknown) => unknown) | undefined => {
    try {
      const called = room.entry(w.version, { kind: 'maker', module, path: ['default', name] })
      // What a maker made lives as long as the room, and its call with it.
      return (input) => callCrossed(undefined, room, { sync: true, pure: false, kept: true }, (o) => called([input], o))
    } catch {
      return undefined
    }
  }
  if (made('room'))
    throw new TentError('T0011', `The module ${module} of the bundle gives \`room\`, which a program alone gives.`, {
      fix: 'Take `room` out of `engine.ts`: where the code of an app runs is the choice of the program that holds it.',
    })
  const found: Record<string, unknown> = {}
  for (const name of makerNames) {
    const maker = made(name)
    if (maker) found[name] = maker
  }
  return isMakers(found) ? found : {}
}

/** Whether a record is one of makers: each entry a function. */
const isMakers = (given: unknown): given is Makers =>
  typeof given === 'object' && given !== null && Object.values(given).every((one) => typeof one === 'function')

/**
 * Takes the makers of the program that holds the engine, what an opening works on, and the room of the app.
 * Answers the makers of the app: entry by entry, those that the opening was handed win over those of the program,
 * which win over those that `engine.ts` of the bundle gives. The text readers are joined in place of chosen: those
 * of the opening are asked first, then those of the bundle, then those of the program, and ours last.
 */
export async function makersFor(program: Makers, w: Opening, room: Room): Promise<Makers> {
  const bundle = await bundleMakers(w, room)
  const lists = [w.makers?.textReaders, bundle.textReaders, program.textReaders].filter((one) => one !== undefined)
  return {
    ...bundle,
    ...program,
    ...w.makers,
    ...(lists.length ? { textReaders: (input) => lists.flatMap((one) => one(input)) } : {}),
  }
}
