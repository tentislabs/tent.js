import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { root } from './typed.ts'

// What names a starter, as the framework had them: their folder and its file, the command that copied one, the
// flag of `tent new` that wrote one, the library of their parts, a starter by its name, and their pages.
const names: RegExp[] = [
  /parts[\\/]starters/i,
  /tentjs\/starters/i,
  /starter\.json/i,
  /tent\.starter\//i,
  /\btent copy\b/i,
  /copyStarter/,
  /command\.copy\b/,
  /\btent new\b[^\n]*--with\b/,
  /base-ui/i,
  /\bbase ui\b/i,
  /\b(signIn|teams|chat|search|parts|sign-in|screen)\s+starters?\b/i,
  /\bstarters?\s+(signIn|teams|chat|search|parts|screen)\b/i,
  /\bstarter\s+of\s+the\s+parts\b/i,
  /\bthe\s+starters\b/i,
  /\b(a|each|every|five|which|no)\s+starter\s+(writes|is|copies|asks|ships|that ships)\b/i,
]

// The papers of the build, which tell its history: the documents, the reports and reviews, the keeper's notes and
// the trials. And what no file of the repository is: what git, a build, an install and a run of the tests leave.
const papers = ['docs/build', 'docs/reports', 'docs/reviews', 'docs/answers.md', 'docs/keeper.md', 'trials']
const left = ['.git', 'node_modules', 'results', '.tent', '.claude', '.runtime']

// The files that are the keeper's own to write, held by a test of their own.
const keepers = ['package.json', 'package-lock.json', 'THIRD-PARTY.md', 'biome.json', 'tsconfig.json']

// This file, which writes the names it looks for, and the test that holds that the command and the flag are gone.
const itself = [
  relative(root, fileURLToPath(import.meta.url))
    .split('\\')
    .join('/'),
  'parts/cli/tests/newBare.test.ts',
]

/** Every file of the repository by its path from the root, but the papers, what is left behind, and these two. */
function filesOfRepository(): string[] {
  const found: string[] = []
  const walk = (at: string): void => {
    for (const name of readdirSync(at)) {
      const path = join(at, name)
      const written = relative(root, path).split('\\').join('/')
      if (left.includes(name) || papers.includes(written) || itself.includes(written)) continue
      if (statSync(path).isDirectory()) walk(path)
      else found.push(written)
    }
  }
  walk(root)
  return found
}

/** Each line of the files that names a starter, as `<path>:<line>  <text>`. */
function naming(files: string[]): string[] {
  return files.flatMap((file) => {
    const bytes = readFileSync(join(root, file))
    // A picture or another file that is no text names nothing.
    if (bytes.includes(0)) return []
    return bytes
      .toString('utf8')
      .split(/\r?\n/)
      .flatMap((line, k) =>
        names.some((one) => one.test(line)) ? [`${file}:${k + 1}  ${line.trim().slice(0, 160)}`] : [],
      )
  })
}

test('[43-1] no file of the repository names a starter or the library of their parts, but the papers of the build', () => {
  const files = filesOfRepository().filter((file) => !keepers.includes(file))
  assert.ok(files.length > 1000, `the search read ${files.length} files`)
  assert.deepEqual(naming(files), [])
})

test('[43-1] no file that the keeper writes names a starter or the library of their parts', () => {
  assert.deepEqual(naming(keepers), [])
})
