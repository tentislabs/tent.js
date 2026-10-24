import { TentError } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import { checkDescription, coreVersion, isWritten } from '../core/internal.ts'

/** The newest format of a description that this engine reads: its own number. */
const ownFormat = 1

// What reads a description of each format number into the form of the newest one. A number is never reused, and
// the reader of an older number stays for as long as an engine reads it.
const readers: Record<number, (held: Record<string, unknown>) => Record<string, unknown>> = {
  1: (held) => held,
}

// The parts of a description that are maps, which the stored text leaves out where they hold nothing.
const maps = [
  'project',
  'tables',
  'functions',
  'flows',
  'screens',
  'components',
  'services',
  'models',
  'routes',
  'incoming',
  'commands',
  'backfills',
  'messages',
  'assets',
  'sources',
  'places',
]

const refused = (words: string, fix: string): TentError => new TentError('T0011', words, { fix })

/** Whether what was read is a description: the check of the shape found nothing in it. */
const fits = (_read: unknown, found: unknown[]): _read is Description => found.length === 0

/**
 * Takes the text of a description, and the newest format number that the reader knows, which is the own number of
 * this engine where none is given. Reads the text by the reader of its format number, and answers the description.
 * Throws T0011 for a text that is no JSON, that states no format of ours, that is of a newer number than the one
 * given, naming both, and for a description that does not pass the shape of the format, naming each field.
 */
export function descriptionOf(text: string, own: number = ownFormat): Description {
  let held: unknown
  try {
    held = JSON.parse(text)
  } catch {
    throw refused('The description is no JSON.', 'Build the project again: the build writes the description.')
  }
  const stated = isWritten(held) ? held.format : undefined
  const number = typeof stated === 'string' ? /^tent\.description\/([1-9]\d*)$/.exec(stated)?.[1] : undefined
  if (!isWritten(held) || number === undefined)
    throw refused(
      `The description states no format of ours: its \`format\` is ${JSON.stringify(stated)}.`,
      'A description states its format, as "tent.description/1". Build the project again.',
    )
  const read = Number(number) <= own ? readers[Number(number)] : undefined
  if (!read)
    throw refused(
      `The description is of the format ${stated}, and this engine reads the formats up to tent.description/${own}.`,
      'Run the bundle with an engine as new as the build tools that built it.',
    )
  const description = { ...Object.fromEntries(maps.map((name) => [name, {}])), ...read(held) }
  const found = checkDescription(description)
  if (!fits(description, found)) {
    const more = found.length > 3 ? `, and ${found.length - 3} more` : ''
    throw refused(
      `The description does not pass the shape of its format: ${found
        .slice(0, 3)
        .map((one) => one.message.replace(/\.$/, ''))
        .join('; ')}${more}.`,
      'A description is written by the build and holds no field that the format does not list. Build the project again.',
    )
  }
  needsNoNewer(description.app.needsEngine)
  return description
}

/**
 * Holds the engine a description states it needs, the major and the minor number of the `core` that built it,
 * against this one: a newer one of the same major version is refused with the version to update to (T0018). An
 * older one runs unchanged, as the promise of a major version says.
 */
function needsNoNewer(needs: string): void {
  const [major, minor] = needs.split('.').map(Number)
  const [own, ownMinor] = coreVersion.split('.').map(Number)
  if (major === own && minor <= ownMinor) return
  if (major < own) return
  throw new TentError(
    'T0018',
    `The app was built for the engine ${needs}, which is newer than this one, ${coreVersion}: update to ${needs} or newer with tent update.`,
    { fix: `Update the player to ${needs} or newer: tent update.` },
  )
}
