import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, fingerprintOf, isStored, sizeOfPicture } from '../../core/internal.ts'
import { keptPath, textOf } from '../source.ts'
import type { Step } from '../work.ts'
import { found } from '../work.ts'

/** The name of an asset in the bundle: its path under `assets/`, with the first twelve characters of its fingerprint before its ending. */
function assetName(name: string, print: string): string {
  print = print.slice(0, 12)
  const dot = name.lastIndexOf('.')
  return dot > name.lastIndexOf('/') + 1
    ? `assets/${name.slice(0, dot)}.${print}${name.slice(dot)}`
    : `assets/${name}.${print}`
}

/** The kinds of picture whose size is read from their bytes, by the ending of their name. */
const pictureKinds: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
}

/** Turns each definition into its record, and holds each file that a definition names to the folder of the project. */
export const step: Step = {
  order: 4,
  run: async (work) => {
    const assets: Record<string, { file: string; width?: number; height?: number }> = {}
    for (const [name, lies] of [...work.assetFiles].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const bytes = readFileSync(lies)
      const print = fingerprintOf(bytes)
      work.prints.set(`assets/${name}`, print)
      // A picture is described with its size, which an `Image` of it that states none takes.
      const kind = pictureKinds[name.slice(name.lastIndexOf('.') + 1).toLowerCase()]
      const size = kind ? sizeOfPicture(kind, new Uint8Array(bytes)) : undefined
      assets[name] = { file: assetName(name, print), ...(size ? { width: size.width, height: size.height } : {}) }
      work.bundle.set(assets[name].file, bytes)
    }
    const { description, findings } = describe({ definitions: work.loaded, assets })
    work.description = description
    // A definition that the reader made with nothing in the place of a value it did not take is told by that
    // value, on its line: what the description finds wrong with it may be that nothing alone.
    work.findings.push(...findings.filter((one) => !work.holed.has(one.where?.definition ?? '')))
    for (const loaded of work.loaded) {
      const name: unknown = Reflect.get(loaded.value, 'definition')
      if (typeof name === 'string' && loaded.why !== undefined) work.why[name] = loaded.why
    }
    const lines = new Map(work.loaded.map((one) => [Reflect.get(one.value, 'definition'), one] as const))
    const named: [string, string, unknown, Record<string, unknown>][] = []
    for (const [name, service] of Object.entries(description.services))
      if (isStored(service.from)) named.push([name, '`from`', service.from.file, service.from])
    for (const [name, made] of Object.entries(description.functions))
      if (isStored(made.python)) named.push([name, '`file`', made.python.file, made.python])
    for (const [name, option, file, record] of named) {
      const loaded = lines.get(name)
      if (typeof file !== 'string') continue
      // A path that starts with a dot is counted from the file that states it, as an import is, and any other
      // from the folder of the project.
      const states = work.files.get(loaded?.file ?? '')?.file
      const lies = file.startsWith('.') && states ? resolve(dirname(states), file) : join(work.folder, file)
      const kept = keptPath(work, lies)
      if (kept !== undefined) {
        // The file is kept by its path in the project, and a file that is read in is named with its fingerprint.
        record.file = kept
        if (option === '`from`' && existsSync(lies))
          record.fingerprint = fingerprintOf(new TextEncoder().encode(textOf(lies)))
        continue
      }
      found(
        work,
        'T1014',
        loaded?.file ?? '',
        loaded?.line,
        `${name}: ${option} names ${file}, which lies outside the folder of the project.`,
        'Move the file into the project, or name its folder in `roots` of `project`.',
        name,
      )
    }
  },
}
