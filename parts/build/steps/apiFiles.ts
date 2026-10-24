import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { finding, isStored, readApiFile } from '../../core/internal.ts'
import { keptPath, textOf } from '../source.ts'
import type { Step } from '../work.ts'

/**
 * Reads the calls of each service that names a published description in `from`: the file is read here and never
 * while the app runs, and only the calls that `use` names reach the description, beside those that `calls`
 * writes; `from` names the calls that the file gave. What the reading finds is T7013, on the line of the service; a
 * call that both give is T1007.
 */
export const step: Step = {
  order: 4.2,
  run: async (work) => {
    if (!work.description) return
    for (const loaded of work.loaded) {
      const name: unknown = Reflect.get(loaded.value, 'definition')
      const options: unknown = Reflect.get(loaded.value, 'options')
      if (Reflect.get(loaded.value, 'kind') !== 'service' || typeof name !== 'string' || !isStored(options)) continue
      const stored = work.description.services[name]
      if (!stored || !isStored(stored.from) || typeof options.from !== 'string') continue
      // A path that starts with a dot is counted from the file that states it, as an import is.
      const states = work.files.get(loaded.file ?? '')?.file
      const written = options.from
      const lies = written.startsWith('.') && states ? resolve(dirname(states), written) : join(work.folder, written)
      // A file outside the project was refused already, and one that is not there is read as no JSON.
      if (keptPath(work, lies) === undefined) continue
      const use = isStored(options.use)
        ? Object.fromEntries(Object.entries(options.use).map(([key, one]) => [key, String(one)]))
        : Array.isArray(options.use)
          ? options.use.map(String)
          : []
      const read = readApiFile(existsSync(lies) ? textOf(lies) : '', use)
      const where = { file: loaded.file ?? '', line: loaded.line ?? 1, definition: name }
      for (const one of read.findings) work.findings.push({ ...one, message: `${name}: ${one.message}`, where })
      const calls = isStored(stored.calls) ? stored.calls : {}
      // The description names the calls that the file gave, so that a file written anew leaves them out.
      const given: string[] = []
      for (const [call, record] of Object.entries(read.calls)) {
        if (Object.hasOwn(calls, call)) {
          work.findings.push(
            finding('T1007', `${name}: the call ${call} is written in \`calls\` and read from \`from\`.`, {
              fix: 'Give the written call another name, or take it out of `use`.',
              where,
            }),
          )
          continue
        }
        calls[call] = record
        given.push(call)
      }
      stored.from = { ...stored.from, calls: given.sort() }
      stored.calls = Object.fromEntries(Object.entries(calls).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    }
  },
}
