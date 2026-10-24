import type { Description } from '../core/internal.ts'
import type { MadeView } from './borrowed/vite.ts'
import { packageOf } from './packageOf.ts'
import { servedOut } from './servedOut.ts'
import { namedFile } from './source.ts'
import type { NamedView } from './viewModules.ts'
import { namedViews, viewModules } from './viewModules.ts'
import type { Work } from './work.ts'

// The packages that the screens import are built apart in development, once, as the builder's own step for the
// packages of a project does: a save then makes the modules of its views alone, and each version of a session that
// holds the same package module loads it once.

/** What the packages of the screens were built into, on one side. */
export interface PackageModules {
  made: MadeView[]
  // Each file that was made, under its name in the bundle.
  named: Map<string, NamedView>
  // Each package that a view imports, by what imports it, with the name its module is imported by.
  packaged: Record<string, string>
  // The style files that each such name brings, by the name its module is imported by.
  styles: Record<string, string[]>
}

/** Whether an import names code: a style file, a picture or a text that a package holds is no module of it. */
const isCode = (named: string): boolean => !/\.[a-z0-9]+$/i.test(named) || /\.[cm]?js$/i.test(named)

/** Whether an import names a plain stylesheet: one of modules names classes for the code, and is built with it. */
const isSheet = (named: string): boolean =>
  /\.(?:css|scss|sass|less|styl|pcss|postcss)$/i.test(named) && !/\.module\./.test(named)

/** Whether an import names a package of the project's own: React is the page code's. */
const isOwn = (named: string): boolean => {
  const name = packageOf(named)
  return name !== undefined && name !== 'react' && name !== 'react-dom'
}

/**
 * Every name by which a screen file, or a file that one reaches by its imports, imports a package or a stylesheet
 * of one on a side, each once, in their order. A browser reaches nothing that only a component drawn on the server
 * alone imports.
 */
export function screenPackages(work: Work, description: Description, side: 'browser' | 'server'): string[] {
  const found = new Set<string>()
  const byPlace = new Map([...work.files.values()].map((file) => [file.file, file] as const))
  const seen = new Set<string>()
  const left = [...work.files.values()].filter((file) => file.sort === 'screen')
  for (let file = left.pop(); file !== undefined; file = left.pop()) {
    if (seen.has(file.file)) continue
    seen.add(file.file)
    const out = side === 'browser' ? servedOut(work, description, file) : undefined
    for (const from of out?.named ?? (file.seen?.named ?? []).map((one) => one.from)) {
      if (file.sort !== 'backend' && isOwn(from) && (isCode(from) || isSheet(from))) found.add(from)
      const target = from.startsWith('.') ? byPlace.get(namedFile(file.file, from) ?? '') : undefined
      if (target) left.push(target)
    }
  }
  return [...found].sort()
}

/** The name of the module of a package in the bundle, before its fingerprint: `@mui/material/Button` is `package.mui-material-Button`. */
const moduleNameOf = (named: string): string => `package.${named.replace(/^@/, '').replace(/[^A-Za-z0-9_-]+/g, '-')}`

/**
 * Takes the work of a build, the description the stubs are written from, the side, and the address of each name of
 * the page code in a browser. In development, has the builder make one module of each package that the screens
 * import, with what they share, or takes them as they were kept. Answers them, with the name each is imported by:
 * `./<file>` beside the modules of a browser, and `tent-package:<file>` on the server, which the page code answers
 * with the first file of that name it was asked for. Each file is named by the fingerprint of what was built, so a
 * package installed anew is never answered by an older module. Answers nothing for a release, and for screens that
 * import no package.
 */
export async function packageModules(
  work: Work,
  description: Description,
  side: 'browser' | 'server',
  paths?: Record<string, string>,
): Promise<PackageModules | undefined> {
  if (work.options.for !== 'dev') return undefined
  const names = screenPackages(work, description, side)
  if (!names.length) return undefined
  const packages = Object.fromEntries(names.filter(isCode).map((one) => [moduleNameOf(one), one]))
  // A stylesheet of a package is built with the packages and kept with them, as Vite keeps each style file apart:
  // a save of a screen that imports it builds the screen's view, and not the stylesheet.
  const sheets = Object.fromEntries(names.filter(isSheet).map((one) => [moduleNameOf(one), one]))
  const made = await viewModules(work, description, {}, side, paths, {
    packages,
    ...(Object.keys(sheets).length ? { sheets } : {}),
  })
  const named = namedViews(made, side)
  const byName = new Map(made.map((one) => [one.name, one] as const))
  // The style files of a module are those it imports itself and those of each module it imports, however deep.
  const stylesOf = (name: string, seen = new Set<string>()): string[] => {
    const one = byName.get(name)
    if (!one || seen.has(name)) return []
    seen.add(name)
    return [...(one.styles ?? []), ...one.imports.flatMap((imported) => stylesOf(imported, seen))]
  }
  const packaged: Record<string, string> = {}
  const styles: Record<string, string[]> = {}
  for (const one of made) {
    const asked = one.entry === undefined ? undefined : (packages[one.entry] ?? sheets[one.entry])
    const final = named.get(one.name)?.name
    if (asked === undefined || final === undefined) continue
    const file = final.slice(side.length + 1)
    packaged[asked] = side === 'browser' ? `./${file}` : `tent-package:${file}`
    styles[packaged[asked]] = [...new Set(stylesOf(one.name))]
      .map((style) => named.get(style)?.name ?? '')
      .filter(Boolean)
  }
  return { made, named, packaged, styles }
}
