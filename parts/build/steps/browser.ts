import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Description } from '../../core/internal.ts'
import { fingerprintOf, isStored, projectLanguages } from '../../core/internal.ts'
import { keeping } from '../lookups.ts'
import { namedAssets } from '../namedAssets.ts'
import { pageCode } from '../pageCode.ts'
import { placeOf } from '../place.ts'
import { moduleName } from '../run.ts'
import { stubsOf } from '../stub.ts'
import { packageModules, screenPackages } from '../packageModules.ts'
import { namedViews, ViewsRefused, viewModules } from '../viewModules.ts'
import type { Step, Work } from '../work.ts'

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

const isCode = (stored: unknown): boolean => isStored(stored) && stored.code === true

/** The fields of a stored screen or component that its module gives the page, beside its view. */
const given = ['title', 'data', 'state', 'layout', 'loading', 'props']

/**
 * The file of each asset that a view names by a text written in place, by the name of the asset, with the size of
 * each that is a picture: those of the view itself, and of every component that it draws, however deep. So a page
 * in a browser knows where each lies, and how large a picture is before it arrives.
 */
function assetsOf(
  work: Work,
  description: Description,
  name: string,
): { files: Record<string, string>; sizes: Record<string, { width: number; height: number }> } {
  const files: Record<string, string> = {}
  const sizes: Record<string, { width: number; height: number }> = {}
  const seen = new Set<string>()
  const waiting = [name]
  for (let one = waiting.pop(); one !== undefined; one = waiting.pop()) {
    if (seen.has(one)) continue
    seen.add(one)
    const stored: unknown = description.screens[one] ?? description.components[one]
    // An `Image` may name an asset by a value of a row, which only a draw reads: such a view is told them all.
    const all = isStored(stored) && Array.isArray(stored.needs) && stored.needs.includes('image')
    for (const asset of all ? Object.keys(description.assets) : (namedAssets(work).get(one) ?? [])) {
      const found: unknown = Object.hasOwn(description.assets, asset) ? description.assets[asset] : undefined
      if (isStored(found) && typeof found.file === 'string') files[asset] = found.file
      if (isStored(found) && typeof found.width === 'number' && typeof found.height === 'number')
        sizes[asset] = { width: found.width, height: found.height }
    }
    if (isStored(stored) && Array.isArray(stored.uses)) waiting.push(...stored.uses.map(String))
  }
  return { files, sizes }
}

/**
 * Whether a view, or a component that it draws, however deep, draws an `Image`: what it loads from another host, it
 * loads from one that the project lists.
 */
function drawsFromHosts(description: Description, name: string, seen = new Set<string>()): boolean {
  if (seen.has(name)) return false
  seen.add(name)
  const stored: unknown = description.screens[name] ?? description.components[name]
  if (!isStored(stored)) return false
  if (Array.isArray(stored.needs) && stored.needs.includes('image')) return true
  return Array.isArray(stored.uses) && stored.uses.some((one) => drawsFromHosts(description, String(one), seen))
}

/** What the module of a screen or of a component gives of its stored record: its name, its kind, and the fields that the page reads. */
export function recordOf(
  work: Work,
  description: Description,
  name: string,
  kind: 'screen' | 'component',
  stored: Record<string, unknown>,
): Record<string, unknown> {
  const record: Record<string, unknown> = { name, kind }
  for (const field of given) if (stored[field] !== undefined && !isCode(stored[field])) record[field] = stored[field]
  const { files, sizes } = assetsOf(work, description, name)
  if (Object.keys(files).length) record.assets = files
  if (Object.keys(sizes).length) record.sizes = sizes
  const hosts = Array.isArray(description.project.hosts) ? description.project.hosts.map(String) : []
  if (hosts.length && drawsFromHosts(description, name)) record.hosts = hosts
  // A state that lives in the page starts in the browser: a screen holds the state of the project beside its own.
  const shared = description.project.state
  if (kind === 'screen' && isStored(shared) && Object.keys(shared).length) record.shared = shared
  return record
}

/** The text that the module of a screen or component starts at: its record, with each arrow that is code under its name. */
export function entryText(
  file: string,
  exportName: string,
  record: Record<string, unknown>,
  stored: Record<string, unknown>,
): string {
  const seo = isStored(stored.seo) ? Object.keys(stored.seo).filter((field) => isCode(Object(stored.seo)[field])) : []
  const code = [
    'view: o.view',
    ...['data', 'title'].filter((field) => isCode(stored[field])).map((field) => `${field}: o.${field}`),
    ...(seo.length ? [`seo: { ${seo.map((field) => `${field}: o.seo.${field}`).join(', ')} }`] : []),
  ]
  return [
    `import { ${exportName} as made } from ${JSON.stringify(file)};`,
    'const o = made.options;',
    `export default { ...${JSON.stringify(record)}, ${code.join(', ')} };`,
    '',
  ].join('\n')
}

/** Every key of a map in the order of the keys, at every depth, so that one record gives one text. */
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted)
  return isStored(value) ? sortedRecord(value) : value
}

export const sortedRecord = (record: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, sorted(record[key])]),
  )

/** The name of the module of each screen and each component: that of its file, with its own name where the file holds several. */
export function modulesOf(
  work: Work,
  names: string[],
): Map<string, { module: string; file: string; exportName: string }> {
  const loaded = work.loaded.filter((one) => ['screen', 'component'].includes(String(Reflect.get(one.value, 'kind'))))
  const found = new Map<string, { module: string; file: string; exportName: string }>()
  for (const one of loaded) {
    const name = String(Reflect.get(one.value, 'definition'))
    const source = work.files.get(one.file ?? '')
    if (!names.includes(name) || !source || one.exportName === undefined) continue
    const several = loaded.filter((other) => other.file === one.file).length > 1
    const module = several ? `${moduleName(source.path)}.${name}` : moduleName(source.path)
    found.set(name, { module, file: source.file, exportName: one.exportName })
  }
  return found
}

// The bytes of each file of the page code, read once: the folder of the page code is named by what it holds.
const pageBytes = keeping<{ bytes: Uint8Array; map?: Uint8Array }>()

/** Makes what a browser loads of the project: its style file, and a module for each screen and each component that is code, with the module that draws each of those on the server. */
export const step: Step = {
  order: 7,
  run: async (work) => {
    const description = work.description
    if (!description || !work.writes || work.findings.some((one) => one.level === 'error')) return
    const screens = Object.keys(description.screens).sort()
    // A project with no screen has no file for a browser.
    if (!screens.length) return
    const components = Object.keys(description.components).sort()
    // The page code is copied as it lies: every project that one release builds holds the same files of it.
    const { folder, page } = await pageCode()
    const form = work.options.for === 'dev' ? page.browserDev : page.browser
    const copied = (file: string, as: string): string => {
      const lies = join(folder, file)
      const dev = work.options.for === 'dev'
      const held = pageBytes.get(`${dev} ${lies}`) ?? {
        bytes: readFileSync(lies),
        // A development bundle holds the map of each file of the page code beside it, where the page code has one.
        ...(dev && existsSync(`${lies}.map`) ? { map: readFileSync(`${lies}.map`) } : {}),
      }
      pageBytes.set(`${dev} ${lies}`, held)
      work.bundle.set(as, held.bytes)
      if (held.map) work.bundle.set(`${as}.map`, held.map)
      return as
    }
    const pageFiles = {
      main: copied(form.main, `browser/${form.main}`),
      names: Object.fromEntries(
        Object.entries(form.names).map(([name, file]) => [name, copied(file, `browser/${file}`)]),
      ),
      // The parts that a page loads only when it needs them, each by its name.
      ...(Object.keys(form.parts).length
        ? {
            parts: Object.fromEntries(
              Object.entries(form.parts).map(([name, file]) => [name, copied(file, `browser/${file}`)]),
            ),
          }
        : {}),
    }
    const serverFile = work.options.for === 'dev' ? page.serverDev : page.server
    const drawing = new Set([copied(serverFile, `server/${serverFile.replace(/^page\.server\.(dev\.)?/, 'page.$1')}`)])
    // In the browser each name of the page code is written as the address of its small file, beside the module.
    const paths = Object.fromEntries(Object.entries(form.names).map(([name, file]) => [name, `./${file}`]))
    const modules = modulesOf(work, [...screens, ...components])
    // The file in the bundle of each asset of the project, by its real place: a style file that names one by its
    // path names that very file, the one that `asset()` names.
    const ownAssets = new Map(
      [...work.assetFiles].flatMap(([asset, lies]) => {
        const file: unknown = Object(description.assets[asset]).file
        return typeof file === 'string' ? [[placeOf(lies), file] as const] : []
      }),
    )
    const ofScreens: Record<string, string[]> = {}
    const ofComponents: Record<string, string[]> = {}
    const entries: Record<string, string> = {}
    const entryOf = new Map<string, string>()
    // The modules of the components that are drawn on the server alone, which a browser never loads.
    const serverOnly = new Set<string>()
    for (const [kind, names] of [
      ['screen', screens],
      ['component', components],
    ] as const)
      for (const name of names) {
        const stored: Record<string, unknown> = (kind === 'screen' ? description.screens : description.components)[name]
        const at = modules.get(name)
        if (!at) continue
        // A query that the stored `data` of a view reads is watched where it is live, as its stub says: a screen holds
        // those of the components it draws too, as the page watches what they read.
        const used = kind === 'screen' && Array.isArray(stored.uses) ? stored.uses.map(String) : []
        const read = [stored, ...used.map((one) => description.components[one])]
          .map((one) => Object(one).data)
          .filter((data) => data !== undefined && !isCode(data))
        const stubs = stubsOf(work, description, read)
        const record = recordOf(work, description, name, kind, stored)
        entries[at.module] = entryText(
          at.file,
          at.exportName,
          sortedRecord({ ...record, ...(Object.keys(stubs).length ? { stubs } : {}) }),
          stored,
        )
        entryOf.set(at.module, name)
        if (stored.browser === false) serverOnly.add(at.module)
      }
    const shared: string[] = []
    const views: Record<string, string> = {}
    // The builder is run only for a project that holds code.
    if (Object.keys(entries).length) {
      // The server's side first: it follows the code of every package, and hands the browser's side the style files
      // that a package brings to a component drawn on the server alone.
      for (const side of ['server', 'browser'] as const) {
        const sided =
          side === 'browser'
            ? Object.fromEntries(Object.entries(entries).filter(([at]) => !serverOnly.has(at)))
            : entries
        const sidePaths = side === 'browser' ? paths : undefined
        // A build that is refused has said why: it makes nothing for a browser.
        const refused = (error: unknown): undefined => {
          if (error instanceof ViewsRefused) return undefined
          throw error
        }
        // The packages of the screens, built apart in development and kept: the views name them, and hold none.
        const apart = await packageModules(work, description, side, sidePaths).catch(refused)
        if (apart === undefined && work.options.for === 'dev' && screenPackages(work, description, side).length) return
        const made = await viewModules(
          work,
          description,
          sided,
          side,
          sidePaths,
          apart ? { packaged: apart.packaged } : {},
        ).catch(refused)
        if (!made) return
        if (side === 'server')
          work.packageLooks = Object.assign({}, ...[...made, ...(apart?.made ?? [])].map((one) => one.looks ?? {}))
        // What each package weighs in the page: the bytes it stands for in every module that a browser loads.
        if (side === 'browser')
          for (const one of [...made, ...(apart?.made ?? [])])
            for (const [name, bytes] of Object.entries(one.packages ?? {})) {
              const known = description.packages?.[name]
              if (known) known.bytes = Number(known.bytes ?? 0) + bytes
            }
        for (const final of apart?.named.values() ?? []) {
          work.bundle.set(final.name, final.bytes)
          if (final.map) work.bundle.set(final.map.name, final.map.bytes)
          if (side === 'server') drawing.add(final.name)
          else if (final.name.endsWith('.js')) shared.push(final.name)
        }
        // In development each module of a view lies at its address with no fingerprint, as Vite serves a page.
        const named = namedViews(made, side, ownAssets, work.options.for === 'dev')
        // What each style file names beside it, as a font, by the style file's name in the bundle.
        const besides = new Map(
          [...named.values(), ...(apart?.named.values() ?? [])].flatMap((one) =>
            one.names ? [[one.name, one.names] as const] : [],
          ),
        )
        // The style files of a module are those it imports itself and those of each shared module it imports,
        // however deep: a package that two screens share brings its stylesheet to both.
        const byName = new Map(made.map((one) => [one.name, one] as const))
        const stylesOf = (name: string, seen = new Set<string>()): string[] => {
          const one = byName.get(name)
          if (!one || seen.has(name)) return []
          seen.add(name)
          return [...(one.styles ?? []), ...one.imports.flatMap((imported) => stylesOf(imported, seen))]
        }
        // The style files of the packages built apart that a module imports, itself or through what it imports.
        const packagedStylesOf = (name: string, seen = new Set<string>()): string[] => {
          const one = byName.get(name)
          if (!one || seen.has(name)) return []
          seen.add(name)
          return one.imports.flatMap((imported) => [
            ...(apart?.styles[imported] ?? []),
            ...packagedStylesOf(imported, seen),
          ])
        }
        for (const one of made) {
          const final = named.get(one.name)
          if (!final) continue
          work.bundle.set(final.name, final.bytes)
          if (final.map) work.bundle.set(final.map.name, final.map.bytes)
          if (side === 'server') drawing.add(final.name)
          const name = one.entry === undefined ? undefined : entryOf.get(one.entry)
          if (side === 'server') {
            if (name !== undefined) views[name] = final.name
          } else if (name === undefined) {
            if (one.name.endsWith('.js')) shared.push(final.name)
          } else {
            const sheets = new Set([
              ...stylesOf(one.name)
                .map((style) => named.get(style)?.name ?? '')
                .filter(Boolean),
              // A package built apart brings its style files to each module that imports it, however deep.
              ...packagedStylesOf(one.name),
            ])
            // The files that the style files name, as fonts, are the view's too: the bundle serves what it names.
            const files = [final.name, ...sheets, ...new Set([...sheets].flatMap((sheet) => besides.get(sheet) ?? []))]
            if (Object.hasOwn(description.screens, name)) ofScreens[name] = files
            else ofComponents[name] = files
          }
        }
      }
    }
    // The messages of each language, over those of the default language, as a page in that language loads them.
    const messages: Record<string, string> = {}
    // A project that states no languages is in English.
    const languages = projectLanguages(description.project)
    const stored: Record<string, unknown> = isStored(description.messages) ? description.messages : {}
    if (Object.keys(stored).length)
      for (const language of languages) {
        const held = { ...Object(stored[languages[0]]), ...Object(stored[language]) }
        const text = `export default ${JSON.stringify(sortedRecord(held))};
`
        messages[language] = `browser/messages.${language}.${fingerprintOf(encode(text)).slice(0, 12)}.js`
        work.bundle.set(messages[language], encode(text))
      }
    // The project's own `error` screen stands under the name a page loads it by when a view fails in the browser. With
    // none, the page code draws its own, which no module holds.
    const failed = Object.entries(description.screens).find(([, one]) => isStored(one) && one.for === 'error')?.[0]
    if (failed !== undefined && ofScreens[failed]) ofScreens['tent.error'] = ofScreens[failed]
    // The style files that several screens import, which every page loads. Only screens are counted: a component's
    // own style file loads with the component, on the pages that draw it, and on no other.
    const counted = new Map<string, number>()
    for (const [name, files] of Object.entries(ofScreens))
      if (name !== 'tent.error')
        for (const file of new Set(files.slice(1).filter((one) => one.endsWith('.css'))))
          counted.set(file, (counted.get(file) ?? 0) + 1)
    const styles = [...counted].flatMap(([file, n]) => (n > 1 ? [file] : [])).sort()
    work.browser = {
      page: pageFiles,
      ...(Object.keys(messages).length ? { messages } : {}),
      ...(styles.length ? { styles } : {}),
      screens: ofScreens,
      ...(Object.keys(ofComponents).length ? { components: ofComponents } : {}),
      ...(shared.length ? { shared: [...shared].sort() } : {}),
    }
    work.screens = { screens: [...drawing][0], ...(Object.keys(views).length ? { views } : {}) }
    work.drawing = drawing
  },
}
