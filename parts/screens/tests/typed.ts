import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** The root of the repository. */
const root = join(import.meta.dirname, '..', '..', '..')

/** One thing the type checker reported: the file, the line and its words. */
export type Reported = { file: string; line: number; words: string }

/**
 * Takes a name and the files of a small project, each a text by its path, in which `tentjs` and `tentjs/ui` are
 * imported by those names. Writes them to a folder of their own under `results/`, carries the type checker out on
 * them with the settings of the root, and answers what it reported. Throws where it could not be started.
 */
export function typeCheck(name: string, files: Record<string, string>): Reported[] {
  const folder = join(root, 'results', 'screens-types', name)
  rmSync(folder, { recursive: true, force: true })
  const { compilerOptions } = JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8'))
  const entry = (part: string): string[] => [join(root, 'parts', part, 'index.ts').replaceAll('\\', '/')]
  const settings = {
    compilerOptions: {
      ...compilerOptions,
      declaration: false,
      paths: { tentjs: entry('core'), 'tentjs/ui': entry('screens') },
    },
    include: ['**/*.ts', '**/*.tsx'],
  }
  for (const [path, text] of Object.entries({ ...files, 'tsconfig.json': JSON.stringify(settings) })) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc')
  const ended = spawnSync(process.execPath, [tsc, '-p', folder, '--pretty', 'false'], { cwd: folder, encoding: 'utf8' })
  if (ended.error) throw ended.error
  const reported: Reported[] = []
  for (const line of `${ended.stdout}${ended.stderr}`.split('\n')) {
    const found = /^(.+?)\((\d+),\d+\): error TS\d+: (.*)$/.exec(line.trim())
    if (found) reported.push({ file: found[1].replaceAll('\\', '/'), line: Number(found[2]), words: found[3] })
  }
  if (ended.status !== 0 && !reported.length)
    throw new Error(`the type checker ended with ${ended.status}: ${ended.stdout}`)
  return reported
}

/** The lines of a text that end in the mark of a line the type checker must refuse, counted from 1. */
export const markedLines = (text: string): number[] =>
  text.split('\n').flatMap((line, at) => (line.trimEnd().endsWith('// refused') ? [at + 1] : []))
