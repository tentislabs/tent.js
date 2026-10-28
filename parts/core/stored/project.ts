import { appCommand } from '../appCommand.ts'
import { fieldsOf } from '../description.ts'
import { limitDefaults, limitKind, limitNames } from '../limits.ts'
import { isMarked } from '../mark.ts'
import type { Stored } from '../record.ts'
import { headOf } from './head.ts'
import { nameAt, nameIf, namesAt } from './named.ts'
import type { Told } from './shared.ts'
import { bytes, code, known, leanOf, ms, optionsOf, plainOf, report, setField, wasOf } from './shared.ts'
import { shownAs } from './shown.ts'
import { projectState } from './state.ts'
import { ruleOf, typeOf, zoneOf } from './type.ts'
import { defaultLanguages, defaultZone } from '../projectDefaults.ts'

/** The options of `project`. */
const projectOptions = [
  'title',
  'languages',
  'zone',
  'currency',
  'icon',
  'head',
  'html',
  'state',
  'signInPath',
  'identify',
  'onRequest',
  'uploads',
  'images',
  'cookies',
  'cli',
  'mcp',
  'python',
  'describeTo',
  'api',
  'roots',
  'trailingSlash',
  'settings',
  'mail',
  'files',
  'limits',
  'redirects',
  'hosts',
  'unlock',
  'privateHosts',
  'hold',
  'countBy',
  'workers',
  'backups',
  'history',
  'publish',
  'cache',
  'release',
  'vitals',
  'trace',
  'removed',
  'build',
  'was',
]

/**
 * The limits of the project as they are stored: a size in bytes, a length of time in milliseconds and a count as it
 * is, each left out where it equals what holds when it is left out. A name that is no limit is T1003.
 */
function projectLimits(told: Told, written: unknown): Stored {
  const o = optionsOf(written)
  known(told, 'limits', o, limitNames)
  const stored: Stored = {}
  for (const [name, one] of Object.entries(o)) {
    const kind = limitKind(name)
    if (kind === undefined) continue
    const made = kind === 'size' ? bytes(told, `limits.${name}`, one) : ms(told, `limits.${name}`, one)
    setField(stored, name, made, limitDefaults.project[name])
  }
  return stored
}

/** The pictures that the image door answers, as they are stored: an empty list of formats is none, and is kept. */
function imagesOf(told: Told, written: unknown): Stored {
  const o = optionsOf(written)
  known(told, 'images', o, fieldsOf('project', 'images'))
  const stored: Stored = {}
  setField(stored, 'widths', o.widths, [320, 640, 960, 1280, 1920, 2560])
  if (Array.isArray(o.formats) && !o.formats.length) stored.formats = []
  else setField(stored, 'formats', o.formats, ['avif', 'webp'])
  return stored
}

/** A part of the project as it was written, held to the names that the shape gives it: T1003 for any other. */
function part(told: Told, o: Stored, name: string): Stored {
  const written = optionsOf(o[name])
  known(told, name, written, fieldsOf('project', name))
  return written
}

/**
 * The hold of the app as it is stored: `true` holds and names no way out; a record holds and names each list of
 * hosts, programs and native modules the app may reach. Left out, and `false`, are off: the app runs as installed.
 */
function holdOf(told: Told, written: unknown): Stored | true | undefined {
  if (written === undefined || written === false) return undefined
  if (written === true) return true
  const o = optionsOf(written)
  known(told, 'hold', o, ['net', 'programs', 'native'])
  const stored: Stored = {}
  for (const name of ['net', 'programs', 'native']) setField(stored, name, o[name])
  return stored
}

const workerDefaults: Stored = {
  wait: 900_000,
  order: 'waited',
  place: 'spread',
  loaded: 'first',
  idleAfter: 120_000,
  lost: 10,
}

/** A kind of worker as it is stored: its times in milliseconds, and a member that equals its default left out. */
function workerOf(told: Told, kind: string, written: unknown): Stored {
  const o = optionsOf(written)
  const stored: Stored = {}
  const names = fieldsOf('project', 'workers', '*')
  known(told, `workers.${kind}`, o, names)
  for (const name of names) {
    const value =
      name === 'wait' || name === 'idleAfter' ? ms(told, `workers.${kind}.${name}`, o[name]) : plainOf(o[name])
    if (
      name === 'alone' &&
      value !== undefined &&
      value !== false &&
      !(Number.isInteger(value) && Number(value) >= 1)
    ) {
      report(
        told,
        'T1014',
        `\`workers.${kind}.alone\` takes false or a whole number of 1 or more: ${shownAs(value)}.`,
        'Write how many workers of the kind may be kept for tasks that are handed out alone, or false.',
      )
      continue
    }
    // `alone` and `systemWork` are stated only as false, so false is kept for them and left out for every other flag.
    if (value === false && name !== 'alone' && name !== 'systemWork' && name !== 'orHere') continue
    setField(stored, name, value, workerDefaults[name])
  }
  return stored
}

/**
 * Takes the options of `project` as they were written. Answers the record of the project as it is stored: times
 * in milliseconds, sizes in bytes, rules as their records, code as its export, and a member that equals its
 * default left out.
 */
export function projectOf(told: Told, o: Stored): Stored {
  known(told, 'project', o, projectOptions)
  const stored: Stored = {}
  setField(stored, 'title', o.title)
  setField(stored, 'languages', o.languages, [...defaultLanguages])
  setField(stored, 'zone', zoneOf(told, 'zone', o.zone), defaultZone)
  if (o.currency !== undefined && !/^[A-Z]{3}$/.test(String(o.currency)))
    report(
      told,
      'T1014',
      `\`currency\` is no three letters: ${shownAs(o.currency)}.`,
      "Write three capitals, as 'USD'.",
    )
  setField(stored, 'currency', o.currency)
  setField(stored, 'icon', plainOf(o.icon))
  setField(stored, 'head', headOf(told, o.head, optionsOf(o.unlock).scripts))
  setField(stored, 'html', htmlOf(told, o.html))
  setField(stored, 'state', projectState(told, o.state))
  setField(stored, 'signInPath', o.signInPath, '/sign-in')
  for (const name of ['identify', 'onRequest', 'build'])
    if (o[name] !== undefined) stored[name] = code(`project_${name}`)
  setField(stored, 'uploads', ruleOf(told, 'uploads', o.uploads, 'project_uploads'), { rule: 'signedIn' })
  setField(stored, 'describeTo', ruleOf(told, 'describeTo', o.describeTo, 'project_describeTo'), { rule: 'signedIn' })
  setField(stored, 'images', imagesOf(told, o.images))
  const cookies = optionsOf(plainOf(part(told, o, 'cookies')))
  if (cookies.sameSite === 'lax') delete cookies.sameSite
  setField(stored, 'cookies', cookies)
  const cli = part(told, o, 'cli')
  // The name of the app's command: small letters, digits and hyphens, and never `tent`, which is the player's.
  const command = appCommand(told.name, cli)
  if (command === 'tent' || !/^[a-z0-9][a-z0-9-]*$/.test(command))
    report(
      told,
      'T1014',
      `the command of the app would be named \`${command.slice(0, 40)}\`, which is ${command === 'tent' ? 'the command of the player' : 'no name of a command'}.`,
      "Give it a name of small letters, digits and hyphens in `cli: { name: '...' }`.",
    )
  setField(stored, 'cli', leanOf(cli))
  setField(stored, 'mcp', mcpOf(told, o.mcp))
  setField(stored, 'python', leanOf(part(told, o, 'python')))
  const api = part(told, o, 'api')
  setField(stored, 'api', plainOf({ ...api, origins: isMarked(api.origins) ? { ...api.origins } : api.origins }))
  setField(stored, 'roots', o.roots)
  setField(stored, 'trailingSlash', o.trailingSlash, 'strip')
  setField(
    stored,
    'settings',
    Object.fromEntries(
      Object.entries(optionsOf(o.settings)).map(([name, one]) => {
        const setting = optionsOf(one)
        // The runtime takes whatever answers a member named `then` for a promise, so no setting can be read under it.
        if (name === 'then')
          report(told, 'T1009', 'the setting name `then` is reserved.', 'Give the setting another name.')
        return [
          name,
          {
            type: typeOf(told, `settings.${name}`, setting.type),
            ...(setting.public === true ? { public: true } : {}),
          },
        ]
      }),
    ),
  )
  setField(stored, 'mail', plainOf(part(told, o, 'mail')))
  setField(stored, 'files', plainOf(part(told, o, 'files')))
  setField(stored, 'limits', projectLimits(told, o.limits))
  setField(
    stored,
    'redirects',
    Array.isArray(o.redirects)
      ? o.redirects.map((one) => {
          const { permanent, ...rest } = optionsOf(one)
          return permanent === false ? { ...rest, permanent } : rest
        })
      : undefined,
  )
  setField(stored, 'hosts', o.hosts)
  setField(stored, 'unlock', leanOf(part(told, o, 'unlock')))
  setField(stored, 'privateHosts', o.privateHosts)
  setField(stored, 'hold', holdOf(told, o.hold))
  setField(stored, 'countBy', o.countBy, 'app')
  setField(
    stored,
    'workers',
    Object.fromEntries(Object.entries(optionsOf(o.workers)).map(([kind, one]) => [kind, workerOf(told, kind, one)])),
  )
  const backups = part(told, o, 'backups')
  const kept: Stored = {}
  setField(kept, 'every', backups.every === false ? false : ms(told, 'backups.every', backups.every), 86_400_000)
  setField(kept, 'keep', backups.keep, 7)
  setField(kept, 'beforeChanges', backups.beforeChanges, true)
  setField(kept, 'test', backups.test, true)
  setField(kept, 'archive', backups.archive, true)
  setField(kept, 'store', plainOf(backups.store))
  setField(stored, 'backups', kept)
  const history: Stored = {}
  setField(history, 'leave', part(told, o, 'history').leave, ['node_modules/'])
  setField(stored, 'history', history)
  const publish = part(told, o, 'publish')
  setField(
    stored,
    'publish',
    plainOf({
      health: nameIf(told, 'publish.health', publish.health),
      within: ms(told, 'publish.within', publish.within),
    }),
  )
  setField(stored, 'cache', leanOf(plainOf(part(told, o, 'cache'))))
  const release = part(told, o, 'release')
  const watch: Record<string, unknown> = Object(release.watch)
  setField(
    stored,
    'release',
    leanOf({
      ...Object(plainOf(release)),
      every: ms(told, 'release.every', release.every),
      ...(release.watch === undefined
        ? {}
        : { watch: leanOf({ ...watch, slowerBy: ms(told, 'release.watch.slowerBy', watch.slowerBy) }) }),
    }),
  )
  setField(stored, 'trace', traceOf(told, o.trace))
  const vitals = part(told, o, 'vitals')
  if (vitals.share !== undefined && (typeof vitals.share !== 'number' || vitals.share < 0 || vitals.share > 1))
    report(
      told,
      'T1014',
      `\`vitals.share\` takes a number from 0 to 1: ${shownAs(vitals.share)}.`,
      'Write the share of the page views that are measured, as 0.1.',
    )
  setField(stored, 'vitals', leanOf(plainOf(vitals)))
  setField(stored, 'removed', o.removed)
  setField(stored, 'was', wasOf(o.was))
  return stored
}

/**
 * What the project states of its traces, as it is stored: the share that is kept, and where they are sent out. A
 * share that is no number from 0 to 1 is T1014.
 */
function traceOf(told: Told, written: unknown): Stored | undefined {
  const o = part(told, { trace: written }, 'trace')
  if (o.share !== undefined && !(typeof o.share === 'number' && o.share >= 0 && o.share <= 1))
    report(
      told,
      'T1014',
      `\`trace.share\` takes a number from 0 to 1: ${shownAs(o.share)}.`,
      'Write the share of the traces that is kept, as 0.1.',
    )
  const stored = leanOf(plainOf(o))
  return typeof stored === 'object' && stored !== null ? Object(stored) : undefined
}

// The attributes of `<html>` that the engine writes itself, which a project does not set.
const ownAttributes = ['lang', 'dir']

/**
 * The attributes that the project sets on `<html>` for a library, as they are stored: a name of small letters,
 * digits and hyphens that is no handler of an event and no attribute the engine writes, and a text. Any other is T1014.
 */
function htmlOf(told: Told, written: unknown): Stored {
  const stored: Stored = {}
  for (const [name, value] of Object.entries(optionsOf(written))) {
    if (
      !/^[a-z][a-z0-9-]*$/.test(name) ||
      name.startsWith('on') ||
      ownAttributes.includes(name) ||
      typeof value !== 'string'
    )
      report(
        told,
        'T1014',
        `\`html\` sets \`${name.slice(0, 40)}\`, which is no attribute a project may set on the page.`,
        'Name an attribute of small letters, digits and hyphens with a text, as `data-shop`: no `on...`, `lang` or `dir`.',
      )
    else stored[name] = value
  }
  return stored
}

/** What the project states for the MCP door, as it is stored. */
function mcpOf(told: Told, written: unknown): Stored {
  const o = optionsOf(written)
  known(told, 'mcp', o, fieldsOf('project', 'mcp'))
  const stored: Stored = {}
  setField(stored, 'toolsListed', o.toolsListed, 20)
  setField(stored, 'asks', o.asks, 'engine')
  setField(stored, 'only', Array.isArray(o.only) ? namesAt(told, 'mcp.only', o.only) : o.only)
  setField(stored, 'clients', plainOf(o.clients))
  setField(
    stored,
    'on',
    Object.fromEntries(
      Object.entries(optionsOf(o.on)).map(([method, one]) => [method, nameAt(told, `mcp.on.${method}`, one)]),
    ),
  )
  setField(stored, 'anyone', o.anyone, false)
  setField(stored, 'stream', o.stream, false)
  setField(
    stored,
    'scopes',
    Object.fromEntries(
      Object.entries(optionsOf(o.scopes)).map(([scope, one]) => [scope, namesAt(told, `mcp.scopes.${scope}`, one)]),
    ),
  )
  setField(stored, 'inline', bytes(told, 'mcp.inline', o.inline))
  setField(stored, 'names', o.names)
  return stored
}
