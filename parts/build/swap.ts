// The sorting of a save of development into the look alone, which a page takes in place by Fast Refresh, or not. It
// follows React's own rule of a boundary, as Vite's plug-in for React and Next.js hold it: a file whose every export
// is a component is taken in place, and one that exports anything else hands that to the files that import it. Where
// it is not sure, a save is no look alone, and the views start anew.
import { codedFieldsText } from './codedFields.ts'
import { keeping } from './lookups.ts'
import { namedFile } from './source.ts'
import type { Node } from './tree.ts'
import { kid, nameOf, unwrap } from './tree.ts'
import { devAddressOf } from './viewModules.ts'
import type { SourceFile, Work } from './work.ts'

/** What a session keeps of a version it built, for the sorting of a later save against it. */
interface Built {
  // The fingerprint of each file of the bundle, and of each file that the build read, by its path.
  bundle: Record<string, string>
  read: Record<string, string>
  // The description as `describe` gave it, with nothing that the text of a file alone moves.
  described: string
  // The code of each field that the description holds as code, which is its record.
  coded: string
}

// The versions that the session built, by their ids, for the folder of each project: the newest few, as a page
// follows the one that runs.
const built = keeping<Map<string, Built>>()
const kept = 4

/** The description, with the places and the fingerprints of the files left out, and the bytes of each package. */
function describedText(work: Work): string {
  const {
    sources: _sources,
    places: _places,
    packages,
    ...rest
  }: Record<string, unknown> = {
    ...(work.described ?? work.description),
  }
  const unweighed = Object.fromEntries(
    Object.entries(Object(packages)).map(([name, one]) => {
      const { bytes: _bytes, ...left } = Object(one)
      return [name, left]
    }),
  )
  return JSON.stringify({ ...rest, packages: unweighed })
}

/** Whether a node that a file exports is a component, by React's own rule: a function or a class whose name is a capital. */
function isComponent(name: string, node: Node | undefined): boolean {
  if (!/^[A-Z]/.test(name) || !node) return false
  if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') return true
  if (node.type !== 'VariableDeclarator') return false
  const init = kid(node, 'init')
  const made = init ? unwrap(init) : undefined
  if (made?.type === 'ArrowFunctionExpression' || made?.type === 'FunctionExpression') return true
  // `memo` and `forwardRef` make a component of a function, as React's runtime reads them.
  if (made?.type !== 'CallExpression') return false
  const callee = kid(made, 'callee')
  const word = callee?.type === 'MemberExpression' ? nameOf(kid(callee, 'property')) : nameOf(callee)
  return word === 'memo' || word === 'forwardRef'
}

/** Whether everything that a file exports beside its definitions is a component. */
function exportsComponents(file: SourceFile): boolean {
  const seen = file.seen
  if (!seen || seen.events.length) return false
  const byDefault = seen.byDefault
  if (
    byDefault &&
    !(byDefault.type === 'FunctionDeclaration' && isComponent(nameOf(kid(byDefault, 'id')) ?? '', byDefault))
  )
    return false
  return seen.helpers.every((one) => isComponent(one.name, one.node))
}

/** Whether a changed file is a boundary: a screen or a component file whose definitions kept their records, or a file of components alone. */
function isBoundary(file: SourceFile): boolean {
  const own = file.seen?.declared ?? []
  if (file.sort === 'screen' && own.length && own.every((one) => one.word === 'screen' || one.word === 'component'))
    return exportsComponents(file)
  return file.sort === 'helper' && !own.length && (file.seen?.helpers.length ?? 0) > 0 && exportsComponents(file)
}

/** The files that a component drawn on the server alone reaches, its own file among them, however deep. */
function servedReach(work: Work, imported: Map<string, string[]>): Set<string> {
  const served = (name: string): boolean => Object(work.description?.components[name]).browser === false
  const left = [...work.files.values()]
    .filter((file) => file.seen?.declared.some((one) => one.word === 'component' && served(one.name ?? one.exportName)))
    .map((file) => file.file)
  const reached = new Set<string>()
  for (let file = left.pop(); file !== undefined; file = left.pop()) {
    if (reached.has(file)) continue
    reached.add(file)
    left.push(...(imported.get(file) ?? []))
  }
  return reached
}

/**
 * Takes the work of a build of a session, the fingerprint of each file it read, and the id of the version that runs.
 * Keeps what is needed of this build for a later save, and answers the modules that a page takes in place where the
 * save changed the look alone against the version that runs: each a path in the bundle. Answers nothing for every
 * other save, and where the version that runs is not one the session keeps.
 */
export function swapOf(work: Work, read: Record<string, string>, running: string | undefined): string[] | undefined {
  const listed = work.listed
  if (!work.versionId || !listed) return undefined
  const now: Built = { bundle: listed, read, described: describedText(work), coded: codedFieldsText(work) }
  const versions = built.get(work.folder) ?? new Map<string, Built>()
  built.set(work.folder, versions)
  const was = running === undefined || running === work.versionId ? undefined : versions.get(running)
  versions.delete(work.versionId)
  versions.set(work.versionId, now)
  for (const old of [...versions.keys()].slice(0, -kept)) versions.delete(old)
  if (!was || was.described !== now.described || was.coded !== now.coded) return undefined
  const files = [...work.files.values()]
  const byPath = new Map(files.map((file) => [file.path, file] as const))
  // A file that changed and is no screen file nor a helper - a backend file, a language file, the project - is no look.
  for (const path of new Set([...Object.keys(was.read), ...Object.keys(read)])) {
    if (was.read[path] === read[path]) continue
    const file = byPath.get(path)
    if (file && file.sort !== 'screen' && file.sort !== 'helper') return undefined
  }
  const byAddress = new Map(files.map((file) => [devAddressOf(work, file.file), file] as const))
  const drawing = work.drawing ?? new Set<string>()
  const changed: string[] = []
  for (const path of new Set([...Object.keys(was.bundle), ...Object.keys(listed)])) {
    if (was.bundle[path] === listed[path] || path.endsWith('.map') || path.startsWith('description.')) continue
    // A module that draws a view on the server follows the save there: only the page's side is sorted here.
    if (path.startsWith('server/') && drawing.has(path)) continue
    // A file that the version left changes nothing that a page holds.
    if (listed[path] === undefined) continue
    // A style file is swapped as a page swaps its style files: one that the page holds no older form of starts the
    // views anew, since the page would not know where it belongs.
    const style = /^browser\/(src|made)\..*\.css$/.test(path) && was.bundle[path] !== undefined
    if (!byAddress.has(path) && !style) return undefined
    changed.push(path)
  }
  // Who imports each file of the project, and what each imports, by where it lies.
  const importers = new Map<string, SourceFile[]>()
  const imported = new Map<string, string[]>()
  for (const file of files)
    for (const one of file.seen?.named ?? []) {
      const target = one.from.startsWith('.') ? namedFile(file.file, one.from) : undefined
      if (target === undefined) continue
      importers.set(target, [...(importers.get(target) ?? []), file])
      imported.set(file.file, [...(imported.get(file.file) ?? []), target])
    }
  // The page shows what the server alone draws as the server drew it: a file that such a component reaches is no
  // boundary, and no importer stands in for it.
  const served = servedReach(work, imported)
  const swap = new Set<string>()
  // A file that is no boundary hands the save to each file that imports it, up to a file of components alone.
  const standIn = (file: SourceFile, seen: Set<string>): boolean => {
    if (seen.has(file.file)) return true
    seen.add(file.file)
    const above = importers.get(file.file) ?? []
    if (!above.length) return false
    return above.every((one) => {
      if (one.sort === 'helper' && isBoundary(one)) return Boolean(swap.add(devAddressOf(work, one.file)))
      return one.sort === 'helper' && standIn(one, seen)
    })
  }
  for (const path of changed) {
    const file = byAddress.get(path)
    if (!file) swap.add(path)
    else if (served.has(file.file)) return undefined
    else if (isBoundary(file)) swap.add(path)
    else if (!standIn(file, new Set())) return undefined
  }
  // A save that changed nothing a page takes in place, as the view of a component that the server alone draws, starts
  // the views anew.
  return swap.size ? [...swap].sort() : undefined
}
