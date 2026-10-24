import { argon2, randomBytes, timingSafeEqual } from 'node:crypto'
import { TentError } from '../../core/index.ts'
import { underWay } from '../context.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'

/** The settings of the method that a stored text names: the memory in KiB, the passes and the lanes. */
interface Settings {
  memory: number
  passes: number
  lanes: number
}

/** A stored password, read from its standard text form. */
interface Stored extends Settings {
  salt: Buffer
  hash: Buffer
}

// The most that a stored text may ask of the method when it is checked: a text that asks for more is no password
// of this app, and is checked as one that does not fit.
const most: Settings = { memory: 1_048_576, passes: 64, lanes: 16 }

// The standard base64 with no filling, as the text form writes its salt and its result.
const bare = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64').replace(/=+$/, '')

/** Reads `$argon2id$v=19$m=<KiB>,t=<passes>,p=<lanes>$<salt>$<hash>`, or answers nothing for any other text. */
function read(stored: unknown): Stored | undefined {
  const parts =
    typeof stored === 'string'
      ? /^\$argon2id\$v=19\$m=(\d{1,10}),t=(\d{1,5}),p=(\d{1,3})\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(stored)
      : null
  if (!parts) return undefined
  const [memory, passes, lanes] = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
  const [salt, hash] = [Buffer.from(parts[4], 'base64'), Buffer.from(parts[5], 'base64')]
  // The method takes a salt of 8 bytes or more and a result of 4 or more, and 8 KiB of memory for each lane.
  if (salt.length < 8 || hash.length < 4 || passes < 1 || lanes < 1 || memory < 8 * lanes) return undefined
  return { memory, passes, lanes, salt, hash }
}

/** The result of the method for a text, a salt and settings, with a result of so many bytes. */
const worked = (text: string, salt: Uint8Array, with_: Settings, length: number): Promise<Buffer> =>
  new Promise((done, failed) =>
    argon2(
      'argon2id',
      {
        message: text,
        nonce: salt,
        parallelism: with_.lanes,
        tagLength: length,
        memory: with_.memory,
        passes: with_.passes,
      },
      (error, result) => (error ? failed(error) : done(Buffer.from(result))),
    ),
  )

/** The settings of today: `limits.passwordMemory` and `limits.passwordPasses` of the project, and one lane. */
const today = (o: Opened): Settings => ({
  memory: Math.floor(storedLimit(o.description, 'passwordMemory') / 1024),
  passes: storedLimit(o.description, 'passwordPasses'),
  lanes: 1,
})

/** Holds a member that answers a promise to where a call may wait. Throws T0013 in a query, a change and a rule. */
function mayWait(member: string): void {
  const kind = underWay()?.work.kind
  if (kind === 'action' || kind === 'seed' || kind === undefined) return
  throw new TentError(
    'T0013',
    `\`passwords.${member}\` answers a promise, and was used in a ${kind}, which waits for nothing.`,
    {
      fix: 'Hash and check a password in an action, a route or a step of a flow.',
    },
  )
}

/**
 * The working object behind the handle `passwords`. The method is Argon2id, which the runtime has built in, and
 * what is stored is its standard text form, which names its method and its settings.
 */
export const handle = (o: Opened): object => ({
  /** Answers a promise of the text to store, made with a new salt of 16 random bytes and a result of 32. */
  hash(text: unknown): Promise<string> {
    mayWait('hash')
    const settings = today(o)
    const salt = randomBytes(16)
    return worked(String(text), salt, settings, 32).then(
      (hash) =>
        `$argon2id$v=19$m=${settings.memory},t=${settings.passes},p=${settings.lanes}$${bare(salt)}$${bare(hash)}`,
    )
  },
  /** Answers a promise of whether a text is the password of a stored text, by the settings that the stored text names. */
  async check(text: unknown, stored: unknown): Promise<boolean> {
    mayWait('check')
    const held = read(stored)
    if (!held || held.memory > most.memory || held.passes > most.passes || held.lanes > most.lanes) return false
    const again = await worked(String(text), held.salt, held, held.hash.length)
    return again.length === held.hash.length && timingSafeEqual(again, held.hash)
  },
  /** Says at once whether a stored text was made with other settings than today's, so that a sign-in can store a new one. */
  old(stored: unknown): boolean {
    const held = read(stored)
    const now = today(o)
    return !(
      held &&
      held.memory === now.memory &&
      held.passes === now.passes &&
      held.lanes === now.lanes &&
      held.salt.length === 16 &&
      held.hash.length === 32
    )
  },
})
