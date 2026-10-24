import type { ChatScreen } from '../../connect/index.ts'
import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { isStored, stateEntries, writeAddress, projectLanguages } from '../../core/internal.ts'
import { screenCaller } from '../door/scopes.ts'
import type { Opened } from '../opened.ts'
import type { About } from '../web/proxy.ts'
import { framePassOf, frameTimes } from './framePass.ts'
import { textAt } from '../files.ts'

/** The file of each screen that is offered to MCP, in each language, as the description of a version names it. */
const filesOf = (description: Description): Record<string, Record<string, string>> => {
  const screens: unknown = Object(description.mcp).screens
  return isStored(screens) ? Object(screens) : {}
}

/** The address of a file of a screen, as a chat app reads it: under the app's name, by the file's own name. */
const uriOf = (description: Description, file: string): string =>
  `ui://${description.app.name}/${file.slice(file.lastIndexOf('/') + 1)}`

/** The values of a screen's address: each `:name` of its pattern, and `rest` for a pattern that ends in `*`. */
function paramsOf(pattern: string): string[] {
  const parts = pattern.split('/').slice(1)
  return parts.flatMap((part) => (part.startsWith(':') ? [part.slice(1)] : part === '*' ? ['rest'] : []))
}

/**
 * The screens of an app that are offered to MCP, in the order of their names, each with the address of its file in
 * a language and its input: the values of its address as text, and each state it keeps in the address.
 */
export function chatScreensOf(o: Opened, language: string): ChatScreen[] {
  const files = filesOf(o.description)
  return Object.keys(files)
    .sort()
    .flatMap((name) => {
      const stored: unknown = o.description.screens[name]
      const file = files[name][language] ?? Object.values(files[name])[0]
      if (!isStored(stored) || typeof file !== 'string') return []
      const input: Record<string, unknown> = {}
      for (const param of paramsOf(String(stored.path))) input[param] = { kind: 'text' }
      for (const [state, entry] of Object.entries(stateEntries(stored.state)))
        if (entry.in === 'address') input[state] = { ...entry.type, optional: true }
      return [{ name, uri: uriOf(o.description, file), about: String(stored.about ?? ''), input }]
    })
}

/**
 * Takes an app, its own address and the address of a file of a screen. Answers the text of the file, with the
 * app's address as the base of what it loads and the version it was built in, and the hosts it loads from: the
 * app's own, also for the live connection. Nothing for an address that no version the app holds names.
 */
export function chatFileOf(o: Opened, origin: string, uri: string): { text: string; hosts: string[] } | undefined {
  const held = [o, ...[...(o.versions?.values() ?? [])].flatMap((one) => (one.served ? [one.served] : []))]
  for (const version of held)
    for (const languages of Object.values(filesOf(version.description)))
      for (const file of Object.values(languages)) {
        if (uriOf(version.description, file) !== uri) continue
        const text = textAt(version.bundle, file)
        const head = `<head>\n<base href="${origin}/">\n<meta name="tent-version" content="${version.version}">`
        const socket = origin.replace(/^http/, 'ws')
        return { text: text.replace('<head>', head), hosts: [origin, socket] }
      }
  return undefined
}

/** The address of a screen for an input of its tool: its values in its pattern, and its states after the question mark. */
function addressOf(stored: Record<string, unknown>, input: Record<string, unknown>, lead: string): string {
  const path = String(stored.path)
    .split('/')
    .map((part) =>
      part.startsWith(':')
        ? encodeURIComponent(String(input[part.slice(1)] ?? ''))
        : part === '*'
          ? String(input.rest ?? '')
          : part,
    )
    .join('/')
  const search = new URLSearchParams(writeAddress(stateEntries(stored.state), input)).toString()
  return `${lead}${path}${search ? `?${search}` : ''}`
}

/**
 * Takes an app, the name of a screen that is offered to MCP, the input of its tool, the caller, the language of the
 * client and what the engine knows of the request. Answers what `/_t/screen` answers for that address, as that
 * caller: the record of the page with the answers of its `data`, the pass of the frame and how often it asks again.
 * Throws for any outcome that is not this screen: T0006 for a sign-in, and the error of the screen otherwise.
 */
export async function chatScreenShown(
  o: Opened,
  name: string,
  input: Record<string, unknown>,
  caller: Caller,
  language: string,
  about: About,
): Promise<{ page: object; pass?: string; frame: Record<string, number> }> {
  const stored = o.description.screens[name]
  const languages = projectLanguages(o.description.project)
  const lead = language === languages[0] ? '' : `/${language}`
  const url = new URL(`http://localhost${addressOf(stored, input, lead)}`)
  const { pageAnswer } = await import('../pages/answer.ts')
  const answer = await pageAnswer(o, url, about.origin, screenCaller(caller), about.from)
  if (answer.headers.location !== undefined)
    throw new TentError('T0006', `The screen ${name} needs a signed-in caller.`, {
      fix: 'Call the tool with the token of a person who signed in.',
    })
  const page = answer.page
  if (!page || answer.status >= 400 || page.screen !== name)
    throw new TentError(page?.error?.code ?? 'T0001', page?.error?.message ?? `The screen ${name} was not shown.`)
  const pass = framePassOf(o, caller, page)
  // The frame is drawn for the user of the program, whom its pass names: its live connection names that user too.
  const user = caller.user ? { id: caller.user.id, roles: [...caller.user.roles] } : page.user
  return { page: { ...page, user }, ...(pass === undefined ? {} : { pass }), frame: frameTimes(o) }
}
