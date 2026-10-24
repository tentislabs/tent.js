import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fingerprintOf } from '../../core/internal.ts'
import { bundle } from '../borrowed/vite.ts'
import { ownSettings } from '../ownSettings.ts'
import { cacheFolder } from '../run.ts'
import type { Step } from '../work.ts'
import { found } from '../work.ts'

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

/**
 * Builds `engine.ts` of the project, where it has one, with the server code: one module under `server/`, named by
 * its fingerprint, which the description names as `server.makers`. The file is no definition file: nothing of it
 * is described, and it is never run by the build.
 */
export const step: Step = {
  order: 6.5,
  run: async (work) => {
    const lies = join(work.folder, 'engine.ts').replaceAll('\\', '/')
    if (!work.description || !existsSync(lies)) return
    const texts = new Map([...work.files.values()].map((file) => [file.file, file.text]))
    // The file is handed over with one line ending, as every source is, so that every system builds the same bytes.
    texts.set(lies, readFileSync(lies, 'utf8').replace(/\r\n/g, '\n'))
    let made: Awaited<ReturnType<typeof bundle>>
    try {
      made = await bundle({
        folder: work.folder,
        tsconfig: ownSettings(work.folder, cacheFolder(work)),
        inputs: { engine: lies },
        external: ['tentjs', 'tentjs/ui', 'tentjs/cli', 'tentjs/engine', 'tentjs/data'],
        read: (file) => texts.get(file),
        small: work.options.for === 'release',
      })
    } catch (error) {
      found(
        work,
        'T1014',
        'engine.ts',
        1,
        `The file engine.ts cannot be loaded: ${error instanceof Error ? error.message : String(error)}`,
        'Mend what the message names.',
      )
      return
    }
    const entry = made.find((one) => one.name === 'engine.js')
    if (!entry) return
    let text = entry.text
    // What the module shares with nothing is still a file of its own where the builder split it: it is named with it.
    for (const other of made) {
      if (other === entry || !other.name.endsWith('.js')) continue
      const name = `engine.${fingerprintOf(encode(other.text)).slice(0, 12)}.${other.name}`
      work.bundle.set(`server/${name}`, encode(other.text.replace(/\n\/\/# sourceMappingURL=.*$/, '')))
      text = text.replaceAll(`"./${other.name}"`, `"./${name}"`)
    }
    const map = '//# sourceMappingURL=engine.js.map'
    const final = `server/engine.${fingerprintOf(encode(text.replace(map, ''))).slice(0, 12)}.js`
    work.bundle.set(final, encode(text.replace(map, `//# sourceMappingURL=${final.slice('server/'.length)}.map`)))
    const source = made.find((one) => one.name === 'engine.js.map')
    if (source) {
      const held: unknown = JSON.parse(source.text)
      work.bundle.set(`${final}.map`, encode(JSON.stringify({ ...Object(held), file: final.slice('server/'.length) })))
    }
    work.makers = final
  },
}
