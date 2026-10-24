import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Description } from '../../core/internal.ts'
import { fingerprintOf, isStored, projectLanguages } from '../../core/internal.ts'
import { bundleOne } from '../borrowed/viteOne.ts'
import { chatFile } from '../chatFile.ts'
import { frameOnly, offered, viewsOf } from '../frameOnly.ts'
import { pageCode } from '../pageCode.ts'
import type { Step, Work } from '../work.ts'
import { sortedRecord } from './browser.ts'

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array | undefined): string | undefined =>
  bytes === undefined ? undefined : new TextDecoder().decode(bytes)

/**
 * The script of the views that a screen draws, as one plain script that hands each record to the part `chat`: the
 * modules the build made for a browser, with the names of the page code read from `__tent`, and every other file
 * they import packed in.
 */
async function codeOf(
  work: Work,
  description: Description,
  views: string[],
  page: string,
): Promise<string | undefined> {
  const browser = work.browser ?? {}
  const screens: Record<string, unknown> = Object(browser.screens)
  const components: Record<string, unknown> = Object(browser.components)
  const modules: string[] = []
  for (const view of views) {
    const stored: unknown = description.screens[view] ?? description.components[view]
    if (!isStored(stored)) continue
    const files = Object.hasOwn(description.screens, view) ? screens[view] : components[view]
    if (Array.isArray(files) && typeof files[0] === 'string') modules.push(files[0])
  }
  if (!modules.length) return undefined
  const entry = [
    ...modules.map((file, place) => `import view${place} from ${JSON.stringify(file)}`),
    `const held = (globalThis.__tentViews ??= [])`,
    `held.push(${modules.map((_, place) => `view${place}`).join(', ')})`,
    '',
  ].join('\n')
  return bundleOne({
    entry,
    small: work.options.for !== 'dev',
    read: (path) =>
      path === `browser/${page}` ? 'export const names = globalThis.__tent.names\n' : decode(work.bundle.get(path)),
  })
}

/**
 * The style files that a screen's file holds: the project's, and those of its views. A view's list also holds the
 * files its style files name, as fonts, which are no styles.
 */
function stylesOf(work: Work, description: Description, views: string[]): string[] {
  const browser = work.browser ?? {}
  const own = Array.isArray(browser.styles) ? browser.styles.map(String) : []
  const ofViews = views.flatMap((view) => {
    const files: unknown = Object(Object.hasOwn(description.screens, view) ? browser.screens : browser.components)[view]
    return Array.isArray(files) ? files.slice(1).map(String) : []
  })
  return [...own, ...ofViews]
    .filter((file) => file.endsWith('.css'))
    .flatMap((file) => {
      const text = decode(work.bundle.get(file))
      return text === undefined ? [] : [wholeAddresses(text, file)]
    })
}

/**
 * A style file with each address it names from where it lies written whole, under `/_t/b/`: inside the file of a
 * screen a style stands under the app's own address, and not where the style file lay.
 */
function wholeAddresses(text: string, file: string): string {
  return text.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (written, quote: string, address: string) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(address)) return written
    const whole = new URL(address, `http://bundle.invalid/_t/b/${file}`).pathname
    return `url(${quote}${whole}${quote})`
  })
}

/**
 * Writes one file for each screen that is offered to MCP, in each language of the project: the page code in its
 * form for one file, with the parts that the screen needs and the part that speaks to a chat app, the records of
 * its views, its styles and the words of the language, all inside the file.
 */
export const step: Step = {
  order: 7.2,
  run: async (work) => {
    const description = work.description
    if (!description || !work.writes || !work.browser || work.findings.some((one) => one.level === 'error')) return
    const names = Object.keys(description.screens)
      .filter((name) => offered(description.screens[name]))
      .sort()
    if (!names.length) return
    const { folder, page } = await pageCode()
    const read = (file: string): string => readFileSync(join(folder, file), 'utf8')
    const main = Object(work.browser.page).main
    const pageMain = typeof main === 'string' ? main.replace(/^browser\//, '') : ''
    const languages = projectLanguages(description.project)
    const messages: Record<string, unknown> = isStored(description.messages) ? description.messages : {}
    const screens: Record<string, Record<string, string>> = {}
    for (const name of names) {
      const views = viewsOf(description, name)
      const needs = new Set(
        views.flatMap((view) => {
          const stored: unknown = description.screens[view] ?? description.components[view]
          return isStored(stored) && Array.isArray(stored.needs) ? stored.needs.map(String) : []
        }),
      )
      const parts = [...needs]
        .sort()
        .flatMap((part) => (page.single.parts[part] ? [read(page.single.parts[part])] : []))
      const code = await codeOf(work, description, views, pageMain)
      const scripts = [read(page.single.main), ...parts, ...(code ? [code] : []), read(page.single.parts.chat)]
      const stored = description.screens[name]
      const styles = stylesOf(work, description, views)
      screens[name] = {}
      for (const language of languages) {
        const held = { ...Object(messages[languages[0]]), ...Object(messages[language]) }
        const text = chatFile({
          language,
          title: typeof stored.title === 'string' ? stored.title : name,
          styles,
          held: { screen: name, language, app: description.app.name, messages: sortedRecord(held) },
          scripts,
        })
        const file = `mcp/${name}.${language}.${fingerprintOf(encode(text)).slice(0, 12)}.html`
        work.bundle.set(file, encode(text))
        screens[name][language] = file
      }
    }
    // The functions that only these screens use are told to a chat app as callable by the frame alone.
    const frame = frameOnly(work, description)
    work.mcp = { screens, ...(frame.length ? { frame } : {}) }
  },
}
