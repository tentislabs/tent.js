import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describing, fingerprintOf } from '../../core/internal.ts'
import { bundlePage } from '../borrowed/vite.ts'
import { isDefinition } from '../defined.ts'
import { keeping } from '../lookups.ts'
import { keeps, reachPrint } from '../reach.ts'
import { ownSettings } from '../ownSettings.ts'
import { cacheFolder, moduleName } from '../run.ts'
import { stubText } from '../stub.ts'
import { lineOf } from '../tree.ts'
import type { Step } from '../work.ts'
import { found } from '../work.ts'

/**
 * What running each command file gave, kept by the fingerprint of the file with everything it reaches: a file that a
 * save did not reach is neither built nor run again.
 */
const loaded = keeping<{ print: string; exports: Record<string, unknown> }>()

/**
 * Loads the commands of each command file. The file is run once, built with its backend imports as stubs that
 * hold the name and the kind of each definition alone, so no backend code runs for it; what it exports with
 * `command(...)` is a definition of the project.
 */
export const step: Step = {
  order: 3.2,
  run: async (work) => {
    const commands = [...work.files.values()]
      .filter((file) => file.sort === 'command')
      .sort((a, b) => (a.path < b.path ? -1 : 1))
    if (!commands.length) return
    const backend = new Map(
      [...work.files.values()].filter((file) => file.sort === 'backend').map((file) => [file.file, file] as const),
    )
    keeps(work)
    for (const file of commands) {
      let exports: Record<string, unknown>
      const print = reachPrint(work, file)
      const kept = loaded.get(file.path)
      try {
        if (kept?.print === print) exports = kept.exports
        else {
          const text = await bundlePage({
            entry: file.file,
            tsconfig: ownSettings(work.folder, cacheFolder(work)),
            side: 'server',
            small: false,
            pure: () => false,
            instead(lies) {
              if (lies === 'tentjs/cli') return { outside: 'tentjs/cli' }
              const held = backend.get(lies)
              if (!held) return undefined
              const declared = held.seen?.declared ?? []
              return {
                text: stubText(
                  declared.map((one) => [one.exportName, { definition: one.name ?? one.exportName, kind: one.word }]),
                ),
              }
            },
          })
          const folder = join(cacheFolder(work), 'commands')
          mkdirSync(folder, { recursive: true })
          const name = moduleName(file.path)
          const lies = join(folder, `${name}.${fingerprintOf(new TextEncoder().encode(text)).slice(0, 12)}.js`)
          // The file that an older text of the command file was run from is let go.
          for (const one of readdirSync(folder))
            if (one.startsWith(`${name}.`) && join(folder, one) !== lies) rmSync(join(folder, one), { force: true })
          writeFileSync(lies, text)
          exports = { ...(await describing(() => import(pathToFileURL(lies).href))) }
          loaded.set(file.path, { print, exports })
        }
      } catch (error) {
        found(
          work,
          'T1014',
          file,
          1,
          `The command file cannot be loaded: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
          'Mend what the message names.',
        )
        continue
      }
      for (const declared of file.seen?.declared ?? []) {
        const made = exports[declared.exportName]
        if (!isDefinition(made, 'command')) continue
        work.loaded.push({
          value: made,
          file: file.path,
          line: lineOf(file.text, declared.statement.start),
          exportName: declared.exportName,
        })
      }
      file.taken = 'run'
    }
  },
}
