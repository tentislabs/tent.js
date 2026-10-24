import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import { unreachedWhy } from '../unreached.ts'
import { headOf } from './head.ts'
import { nameIf } from './named.ts'
import type { Told } from './shared.ts'
import { known, ms, optionsOf, report, required, setField, wasOf } from './shared.ts'
import { ruleOf, typesOf } from './type.ts'
import { cookieBytes, isCode, jsonBytes, namesFree, viewData, viewOf, viewState, viewValue } from './view.ts'
import { projectLanguages } from '../projectDefaults.ts'

/** The options of `screen`. */
const screenOptions = [
  'path',
  'for',
  'view',
  'access',
  'title',
  'about',
  'data',
  'state',
  'layout',
  'loading',
  'cache',
  'server',
  'seo',
  'head',
  'offer',
  'framedBy',
  'was',
]

/** The options of `component`. */
const componentOptions = ['view', 'props', 'data', 'state', 'layout', 'browser', 'personal', 'was']

/** The four special screens, which state `for` in place of an address. */
const special = ['notFound', 'error', 'grant', 'ask']

/** The most bytes that the device states of an app may hold together, in the one cookie that keeps them. */
const cookieRoom = 3500

/** The project of the app that is being described, as it was written. */
const writtenProject = (told: Told): Stored =>
  [...told.all.values()].find((one) => one.kind === 'project')?.options ?? {}

/** Reports an address that no request can reach: one under `/_t/`, and one whose first part is a language. */
function pathHeld(told: Told, path: unknown): void {
  if (typeof path !== 'string') return
  const why = unreachedWhy(path, projectLanguages(writtenProject(told)))
  if (why !== undefined)
    report(
      told,
      'T1014',
      `its \`path\` ${why}.`,
      path.startsWith('/') ? 'Give it another address.' : 'Start the address with `/`.',
    )
}

/** The search-engine fields of a screen as they are stored, with what the build read of their arrows. */
function seoOf(told: Told, written: unknown): Stored {
  const o = optionsOf(written)
  const views = optionsOf(told.loaded.views)
  known(told, 'seo', o, ['description', 'image', 'index', 'data', 'addresses'])
  const stored: Stored = {}
  for (const field of ['description', 'image', 'data'])
    setField(stored, field, viewValue(o[field], views[`seo.${field}`]))
  // An image that names a component is drawn into the picture of a shared link.
  if (isStored(o.image) && o.image.view !== undefined) setField(stored, 'image', imageOf(told, o.image))
  if (o.index === false) stored.index = false
  const addresses = optionsOf(o.addresses)
  const query = nameIf(told, 'seo.addresses', addresses.read)
  if (query !== undefined) {
    stored.addresses = { query }
    setField(Object(stored.addresses), 'input', isStored(addresses.input) ? { ...addresses.input } : undefined)
  }
  return stored
}

/** How long a screen is kept in the cache, as it is stored: a time, or a time with `public`. */
function cacheOf(told: Told, written: unknown): unknown {
  if (!isStored(written)) return ms(told, 'cache', written)
  known(told, 'cache', written, ['for', 'public'])
  const stored: Stored = {}
  setField(stored, 'for', ms(told, 'cache.for', written.for))
  setField(stored, 'public', written.public, false)
  return stored
}

/** The picture of a screen for the links to it that are shared, as it is stored: its component, and its size. */
function imageOf(told: Told, written: unknown): unknown {
  if (written === undefined) return undefined
  const o = optionsOf(written)
  known(told, 'seo.image', o, ['view', 'size'])
  const view = nameIf(told, 'seo.image.view', o.view)
  if (view === undefined) return undefined
  const size = Array.isArray(o.size) ? o.size.map(Number) : undefined
  if (size !== undefined && (size.length !== 2 || !size.every((n) => Number.isInteger(n) && n >= 16 && n <= 4096)))
    report(
      told,
      'T1014',
      'its `seo.image.size` is not two whole numbers of pixels from 16 to 4096.',
      'Write `size: [1200, 630]`.',
    )
  return { view, ...(size?.length === 2 ? { size } : {}) }
}

/** What a screen and a component store alike: the state, the data, and the names of what its view draws and needs. */
function sharedOf(told: Told, kind: 'screen' | 'component', o: Stored, stored: Stored, more: Stored): void {
  const views = optionsOf(told.loaded.views)
  const data = viewData(told, o.data, views.data)
  const layout = nameIf(told, 'layout', o.layout)
  const loading = nameIf(told, 'loading', o.loading)
  setField(stored, 'state', viewState(told, kind, o.state))
  if (data !== undefined && (isCode(data) || Object.keys(data).length)) stored.data = data
  Object.assign(stored, viewOf(told, [layout, loading]))
  setField(stored, 'layout', layout)
  setField(stored, 'loading', loading)
  Object.assign(stored, more)
  setField(stored, 'was', wasOf(o.was))
}

/**
 * Takes the options of a screen as they were written. Answers the record of the screen as it is stored. Reports an unknown option (T1003), `path` beside
 * `for` (T1007), a required option that is left out (T1008), a reserved name (T1009), and a state, an address, a
 * `for` or a line of the head that is not allowed (T1014).
 */
export function screenOf(told: Told, o: Stored): Stored {
  known(told, 'screen', o, screenOptions)
  required(told, 'screen', o, ['view', 'access'])
  if (o.path !== undefined && o.for !== undefined)
    report(told, 'T1007', 'it states `path` and `for` at once.', 'Keep one of the two.')
  else if (o.path === undefined && o.for === undefined)
    report(told, 'T1008', 'it states neither `path` nor `for`.', 'State `path`, or `for` for a special screen.')
  if (o.for !== undefined && !special.includes(String(o.for)))
    report(told, 'T1014', '`for` is none of the four special screens.', "Write 'notFound', 'error', 'grant' or 'ask'.")
  pathHeld(told, o.path)
  const stored: Stored = {}
  setField(stored, 'path', o.path)
  setField(stored, 'for', o.for)
  const more: Stored = {}
  setField(more, 'title', viewValue(o.title, optionsOf(told.loaded.views).title))
  setField(more, 'access', ruleOf(told, 'access', o.access, `${told.name}_access`))
  setField(more, 'cache', cacheOf(told, o.cache))
  if (o.server === false) more.server = false
  setField(more, 'offer', o.offer)
  setField(more, 'about', o.about)
  setField(more, 'framedBy', o.framedBy)
  setField(more, 'head', headOf(told, o.head, optionsOf(writtenProject(told).unlock).scripts))
  setField(more, 'seo', o.seo === undefined ? undefined : seoOf(told, o.seo))
  sharedOf(told, 'screen', o, stored, more)
  return stored
}

/**
 * Takes the options of a component as they were written. Answers the record of the component as it is stored.
 * Reports an unknown option (T1003), a `view` that is left out (T1008), a reserved name (T1009), and a state that
 * a component may not declare (T1014).
 */
export function componentOf(told: Told, o: Stored): Stored {
  known(told, 'component', o, componentOptions)
  required(told, 'component', o, ['view'])
  namesFree(told, 'props', Object.keys(optionsOf(o.props)))
  const stored: Stored = {}
  setField(stored, 'props', typesOf(told, 'props', o.props))
  const more: Stored = {}
  if (o.browser === false) more.browser = false
  if (o.personal === true) more.personal = true
  sharedOf(told, 'component', o, stored, more)
  return stored
}

/** The device states of a record of states: for each the bytes of its entry in the JSON text of the cookie, its name with `front` before it. */
const deviceEntries = (state: unknown, front: string): number[] =>
  Object.entries(optionsOf(state))
    .filter(([, one]) => isStored(one) && one.in === 'device' && isStored(one.type))
    .map(([name, one]) => jsonBytes(`${front}${name}`) + 1 + (cookieBytes(Object(one).type) ?? 0))

/**
 * Takes the stored state of the project and the stored screens. Answers how many bytes the value of the one cookie
 * of the device states could hold, and whether that passes its room. The value is the JSON text of one record of
 * the states, a state of a screen under the name of the screen, a dot and its own, written as base64url: so it is
 * counted with every state at the largest it could hold, and four bytes for every three of the text.
 */
export function deviceRoom(project: unknown, screens: Record<string, Stored>): { bytes: number; passed: boolean } {
  const entries = deviceEntries(project, '')
  for (const [name, screen] of Object.entries(screens)) entries.push(...deviceEntries(screen.state, `${name}.`))
  if (!entries.length) return { bytes: 0, passed: false }
  // The brackets of the record, a comma between two entries, and each entry: its name, a colon and its value.
  const text = entries.reduce((sum, one) => sum + one, 2 + entries.length - 1)
  const bytes = Math.ceil((text * 4) / 3)
  return { bytes, passed: bytes > cookieRoom }
}
