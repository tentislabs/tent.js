import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { TentError, text } from '../../../core/index.ts'
import { finding } from '../../../core/internal.ts'
import { guardedFetch } from '../../../connect/index.ts'
import { inVersion31 } from '../../apiVersion.ts'
import { readYaml } from '../../borrowed/yaml.ts'
import type { Command } from '../../command.ts'
import { commandPoint } from '../../commandPoint.ts'
import { projectOf } from '../../projectOf.ts'

/** The text of a file, or of an address, which is fetched through the guarded fetch: the address is the person's own word. */
async function textOf(from: string, folder: string): Promise<string> {
  if (!/^https?:\/\//i.test(from)) return readFileSync(resolve(folder, from), 'utf8')
  const answer = await guardedFetch({ mode: 'live', privateHosts: [new URL(from).origin.replace(/^https:\/\//, '')] })(
    from,
  )
  if (!answer.ok) throw new TentError('T7013', `${from} answered ${answer.status}, and no description.`)
  return answer.text()
}

/**
 * `tent api read <file or address> --out <file>`: reads a description of an API, in JSON or in YAML, of the version
 * 3.0 or 3.1 or the one before them, and writes it into the project as JSON of 3.0 or 3.1, which the build reads
 * with `from`. Any other is T7013, and nothing is written.
 */
export const command: Command = {
  name: 'api read',
  args: { from: text(), out: text() },
  needs: 'nothing',
  run: async ({ args, folder }) => {
    const from = String(args.from)
    const refused = (words: string) => ({
      findings: [finding('T7013', words, { fix: 'Name a description of an API in version 2.0, 3.0 or 3.1.' })],
    })
    let written: string
    try {
      written = await textOf(from, folder)
    } catch (error) {
      if (error instanceof TentError && error.code !== 'T7013') throw error
      return refused(error instanceof Error ? error.message : `${from} cannot be read.`)
    }
    let read: unknown
    try {
      read = JSON.parse(written)
    } catch {
      // What is no JSON is read as YAML, by a part that is fetched at its first use.
      try {
        read = await readYaml(written)
      } catch (error) {
        if (error instanceof TentError) throw error
        return refused(`${from} reads neither as JSON nor as YAML.`)
      }
    }
    const made = inVersion31(read)
    if (!made) return refused(`${from} is no description of an API in version 2.0, 3.0 or 3.1.`)
    const out = resolve(folder, String(args.out))
    // What the command writes into a project is held between two points of its history, so it can be gone back from.
    const project = projectOf(folder)
    if (project) await commandPoint(project)
    mkdirSync(dirname(out), { recursive: true })
    // The file is written whole beside its place and renamed into it, so a build never reads half of it.
    writeFileSync(`${out}.new`, `${JSON.stringify(made, null, 2)}\n`)
    renameSync(`${out}.new`, out)
    if (project) await commandPoint(project)
    return { value: { out: String(args.out), version: String(made.openapi) } }
  },
}
