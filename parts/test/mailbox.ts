import type { Unsent } from '../engine/index.ts'
import { mailboxOf } from '../engine/index.ts'
import type { World } from './machines.ts'

/**
 * Takes the world of a test app. Answers its mail, each message as a `Mailer` is handed it: of each machine, what
 * the apps it ran before kept, and then what the mailbox of the engine of its running app keeps.
 */
export const mailOf = (world: World): Unsent[] =>
  [...world.machines.values()].flatMap((machine) => [...machine.mailed, ...(machine.app ? mailboxOf(machine.app) : [])])
