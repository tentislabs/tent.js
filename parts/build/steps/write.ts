import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { checkDescription, descriptionShape, fingerprintOf, toJsonSchema, write } from '../../core/internal.ts'
import { finishedOf } from '../finished.ts'
import { keeping, ofSession } from '../lookups.ts'
import type { Step } from '../work.ts'

// The schema of a description is the same for every build of one framework: it is worked out once.
let schemaText: Uint8Array | undefined
const schemaOf = (): Uint8Array => {
  schemaText ??= new TextEncoder().encode(`${JSON.stringify(toJsonSchema(descriptionShape), null, 2)}\n`)
  return schemaText
}

// The fingerprint of the bytes of each file of a bundle: a step hands the very bytes again for a file it kept.
const printed = new WeakMap<Uint8Array, string>()
const printOf = (bytes: Uint8Array): string => {
  const made = printed.get(bytes) ?? fingerprintOf(bytes)
  printed.set(bytes, made)
  return made
}

// The fingerprints that the store of each project holds, by the store: read from the disk once in a session.
const storeHolds = keeping<Set<string>>()

/**
 * Keeps one file of a version in the store of the session, under the fingerprint of its bytes, where it does not
 * lie there yet: a save writes only the files whose bytes it changed.
 */
async function kept(store: string, bytes: Uint8Array, print: string): Promise<void> {
  let holds = storeHolds.get(store)
  if (!holds) {
    holds = new Set(readdirSync(store))
    storeHolds.set(store, holds)
  }
  if (holds.has(print)) return
  holds.add(print)
  try {
    await writeFile(join(store, print), bytes, { flag: 'wx' })
  } catch (error) {
    // A file of that fingerprint that stands holds the same bytes.
    if (Reflect.get(Object(error), 'code') !== 'EEXIST') throw error
  }
}

/** The fingerprints that a list of a version names, or none where the file is no list. */
function namedBy(list: string): string[] {
  try {
    const files: unknown = Reflect.get(Object(JSON.parse(readFileSync(list, 'utf8'))), 'files')
    return typeof files === 'object' && files !== null ? Object.values(files).map(String) : []
  } catch {
    return []
  }
}

/**
 * Takes the folder of a project and the folders that hold other lists of its versions, as the engine keeps them.
 * Removes from the store of the project each file that no list names any more: what a session of development
 * leaves of the versions that can no longer be loaded.
 */
export async function storeTidied(folder: string, others: string[]): Promise<void> {
  const build = join(folder, '.tent', 'build')
  const store = join(build, 'files')
  const named = new Set<string>()
  for (const at of [build, ...others]) {
    let names: string[]
    try {
      names = readdirSync(at)
    } catch {
      continue
    }
    for (const name of names) if (name.endsWith('.json')) for (const print of namedBy(join(at, name))) named.add(print)
  }
  let held: string[]
  try {
    held = readdirSync(store)
  } catch {
    return
  }
  const gone = held.filter((print) => !named.has(print))
  await Promise.all(gone.map((print) => rm(join(store, print), { force: true, maxRetries: 20, retryDelay: 50 })))
  const holds = storeHolds.get(store)
  for (const print of gone) holds?.delete(print)
}

/** Finishes the description, and writes the bundle where nothing that was found is an error. */
export const step: Step = {
  order: 9,
  run: async (work) => {
    if (!work.description) return
    // The modules that draw the screens are named apart from those of the backend files.
    const server = [...work.bundle.keys()]
      .filter((name) => name.startsWith('server/') && name.endsWith('.js') && !work.drawing?.has(name))
      // The module of the makers, with what it alone holds, is no module of a definition.
      .filter((name) => !name.startsWith('server/engine.'))
      .sort()
    work.described = work.description
    const description = finishedOf(work, work.description, {
      ...(server.length || work.screens || work.makers
        ? {
            server: {
              ...work.screens,
              ...(server.length ? { modules: server } : {}),
              ...(work.makers ? { makers: work.makers } : {}),
            },
          }
        : {}),
      ...(work.browser ? { browser: work.browser } : {}),
      ...(work.api ? { api: work.api } : {}),
      ...(work.cli ? { cli: work.cli } : {}),
      ...(work.mcp ? { mcp: work.mcp } : {}),
    })
    work.description = description
    const errors = () => work.findings.some((one) => one.level === 'error')
    if (!errors())
      work.findings.push(
        ...checkDescription(description).map((one) => ({ ...one, code: 'T0011', name: 'bad-description' })),
      )
    if (errors() || !work.writes) return
    const written = write(description)
    work.versionId = written.versionId
    work.bundle.set('description.schema.json', schemaOf())
    const build = join(work.folder, '.tent', 'build')
    if (ofSession() && work.options.out === undefined) {
      // A version of a session of development is the list of its files, each kept once by its fingerprint.
      const store = join(build, 'files')
      // A store that is not there holds nothing, whatever the session knew of it: its folder was taken away.
      if (!existsSync(store)) storeHolds.set(store, new Set())
      mkdirSync(store, { recursive: true })
      work.bundle.set('description.json', written.bytes)
      const files = Object.fromEntries(
        [...work.bundle.keys()].sort().map((name) => [name, printOf(work.bundle.get(name) ?? new Uint8Array())]),
      )
      await Promise.all([...work.bundle].map(([name, bytes]) => kept(store, bytes, files[name])))
      work.listed = files
      // The list is written last, and whole: a version that has one has every file.
      work.bundleList = join(build, `${written.versionId}.json`)
      writeFileSync(work.bundleList, `${JSON.stringify({ files })}\n`)
      return
    }
    work.bundleFolder = work.options.out ?? join(build, written.versionId)
    // Each folder is made once, and the files are written side by side: a build waits for the slowest alone.
    const folders = new Set([...work.bundle.keys()].map((name) => dirname(join(String(work.bundleFolder), name))))
    for (const one of folders) mkdirSync(one, { recursive: true })
    await Promise.all([...work.bundle].map(([name, bytes]) => writeFile(join(String(work.bundleFolder), name), bytes)))
    // The description is written last: a bundle that holds one is whole.
    writeFileSync(join(work.bundleFolder, 'description.json'), written.bytes)
  },
}
