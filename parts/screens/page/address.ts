import type { StubbedDefinition } from '../../core/internal.ts'
import { isDoorPath, isPath, isStored, stateEntries } from '../../core/internal.ts'

/** Whether an address leaves the app by a kind that a link may have. */
export const isOutside = (address: string): boolean => /^(https?:\/\/|mailto:|tel:)/i.test(address)

/**
 * Takes an address, a language, and the languages of the project. Answers the address in that language: a path
 * of the app has the code of any language but the default first, and one that already has the code of a language
 * of the project first is taken as it is written, since no screen's own address starts with one.
 */
export function spokenIn(address: string, language: string, languages: readonly string[]): string {
  if (!address.startsWith('/') || address.startsWith('//')) return address
  const first = address.slice(1).split(/[/?#]/)[0]
  if (languages.slice(1).includes(first)) return address
  if (language === languages[0] || !languages.includes(language)) return address
  return address === '/' || /^\/[?#]/.test(address) ? `/${language}${address.slice(1)}` : `/${language}${address}`
}

/**
 * Takes an address and the patterns of the routes of the app that state GET. Answers whether the page loads the
 * address whole, as it is written, with no code of a language and no slash added: an address that the door takes
 * before any screen, and the path of such a route.
 */
export function loadedWhole(address: string, routes: readonly string[] | undefined): boolean {
  const path = address.split(/[?#]/)[0]
  if (isDoorPath(path)) return true
  const parts = path.split('/').slice(1)
  const fits = (pattern: string): boolean => {
    const wanted = pattern.split('/').slice(1)
    const rest = wanted.at(-1) === '*'
    const fixed = rest ? wanted.slice(0, -1) : wanted
    if (rest ? parts.length < fixed.length : parts.length !== fixed.length) return false
    return fixed.every((one, k) => (one.startsWith(':') ? parts[k] !== '' : one === parts[k]))
  }
  return (routes ?? []).some(fits)
}

/** A path of the app with a slash at the end of its path, as a project that keeps one writes every address. */
export function slashedIn(address: string): string {
  if (!address.startsWith('/') || address.startsWith('//')) return address
  const at = address.search(/[?#]/)
  const [path, rest] = at < 0 ? [address, ''] : [address.slice(0, at), address.slice(at)]
  return path === '/' || path.endsWith('/') ? address : `${path}/${rest}`
}

/** One value as an address writes it after the question mark: a list once for each entry, and an object by dotted names. */
function written(name: string, value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return value.flatMap((one) => written(name, one))
  if (isStored(value)) return Object.entries(value).flatMap(([key, one]) => written(`${name}.${key}`, one))
  return [`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`]
}

/**
 * Takes a screen as a screen file holds it and what the page holds of each screen. Answers its stub: its address
 * and the names of the state it keeps in the address. A screen of another file reaches a file as its stub, and
 * one of the same file as its definition, whose options say both.
 */
export function screenStub(
  target: unknown,
  screen: (name: string) => StubbedDefinition | undefined,
): StubbedDefinition | undefined {
  if (!isStored(target) || typeof target.definition !== 'string') return undefined
  if (typeof target.path === 'string')
    return {
      definition: target.definition,
      kind: 'screen',
      path: target.path,
      ...(Array.isArray(target.state) ? { state: target.state.map(String) } : {}),
    }
  const options = target.options
  if (isStored(options) && typeof options.path === 'string')
    return {
      definition: target.definition,
      kind: 'screen',
      path: options.path,
      state: Object.entries(stateEntries(options.state)).flatMap(([name, entry]) =>
        entry.in === 'address' ? [name] : [],
      ),
    }
  return screen(target.definition)
}

/**
 * Takes where a move goes, a screen as a screen file holds it or a path of the app, and the values that `with`
 * gives. Answers the address: the values of the screen's pattern are put in their places, and the states it keeps
 * in the address stand after the question mark. Answers nothing for what is no address of the app.
 */
export function addressOf(
  target: unknown,
  values: unknown,
  screen: (name: string) => StubbedDefinition | undefined,
): string | undefined {
  if (typeof target === 'string') {
    if (target.startsWith('#')) return target
    // What `with` gives beside a path that the page loads whole is written after its question mark.
    const after = isStored(values) ? Object.entries(values).flatMap(([name, value]) => written(name, value)) : []
    const address = after.length ? `${target}${target.includes('?') ? '&' : '?'}${after.join('&')}` : target
    return isPath(address) ? address : undefined
  }
  const stub = screenStub(target, screen)
  const pattern = stub?.path
  if (pattern === undefined) return undefined
  const given = isStored(values) ? { ...values } : {}
  const parts = pattern.split('/').map((part) => {
    const name = part === '*' ? 'rest' : part.startsWith(':') ? part.slice(1) : undefined
    if (name === undefined) return part
    const value = given[name]
    delete given[name]
    // The rest of an address is several parts, and a value is one: its slashes are written with their percent signs.
    return part === '*'
      ? String(value ?? '')
          .split('/')
          .map(encodeURIComponent)
          .join('/')
      : encodeURIComponent(String(value ?? ''))
  })
  const state = stub?.state ?? []
  const after = state.flatMap((name) => (typeof name === 'string' ? written(name, given[name]) : []))
  const address = `${parts.join('/')}${after.length ? `?${after.join('&')}` : ''}`
  return isPath(address) ? address : undefined
}
