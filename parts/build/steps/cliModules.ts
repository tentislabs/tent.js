import { fingerprintOf } from '../../core/internal.ts'
import { bundlePage } from '../borrowed/vite.ts'
import { keeping } from '../lookups.ts'
import { keeps, reachPrint } from '../reach.ts'
import { ownSettings } from '../ownSettings.ts'
import { cacheFolder, moduleName } from '../run.ts'
import { declaredStub, stubText } from '../stub.ts'
import type { Step } from '../work.ts'
import { found } from '../work.ts'

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

// The module made of each command file, kept by the fingerprint of the file with everything it reaches, and the
// form of the build: a save that did not reach the file makes it no more.
const made = keeping<{ print: string; text: string }>()

/**
 * Makes one module for each command file, under `cli/`: the packages it imports inside, each import of a backend
 * file replaced by the stubs of its definitions, and `tentjs/cli` left as it is, which the runner answers with its
 * own entry. Each command of the file names its module and its export; the description names every file.
 */
export const step: Step = {
  order: 7.5,
  run: async (work) => {
    const description = work.description
    if (!description || !work.writes || work.findings.some((one) => one.level === 'error')) return
    const commands = [...work.files.values()]
      .filter((file) => file.sort === 'command')
      .sort((a, b) => (a.path < b.path ? -1 : 1))
    if (!commands.length) return
    const backend = new Map(
      [...work.files.values()].filter((file) => file.sort === 'backend').map((file) => [file.file, file] as const),
    )
    const files: string[] = []
    keeps(work)
    for (const file of commands) {
      let text: string
      // The stubs of the backend files it imports are part of what it is made of: they hold the input types.
      const print = `${work.options.for} ${reachPrint(work, file)}`
      const kept = made.get(file.path)
      try {
        text =
          kept?.print === print
            ? kept.text
            : await bundlePage({
                entry: file.file,
                tsconfig: ownSettings(work.folder, cacheFolder(work)),
                side: 'server',
                small: work.options.for === 'release',
                pure: () => false,
                instead(lies) {
                  if (lies === 'tentjs/cli') return { outside: 'tentjs/cli' }
                  const held = backend.get(lies)
                  // A backend file reaches a command as the names of its definitions alone.
                  if (held)
                    return {
                      text: stubText(
                        (held.seen?.declared ?? []).map((one) => [one.exportName, declaredStub(description, one)]),
                      ),
                    }
                  return undefined
                },
              })
        made.set(file.path, { print, text })
      } catch (error) {
        found(
          work,
          'T1014',
          file,
          1,
          `The command file cannot be built: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
          'Mend what the message names.',
        )
        continue
      }
      const module = `cli/${moduleName(file.path)}.${fingerprintOf(encode(text)).slice(0, 12)}.js`
      work.bundle.set(module, encode(text))
      files.push(module)
      for (const declared of file.seen?.declared ?? []) {
        const record = declared.word === 'command' ? description.commands[declared.name ?? ''] : undefined
        if (!record) continue
        record.module = module
        record.export = declared.exportName
      }
    }
    work.cli = { files }
  },
}
