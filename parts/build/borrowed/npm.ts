import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Where the npm lies that a release ships, or that this file finds as a package, as in the package of the npm door. */
function shippedNpm(inside: string[]): string[] {
  // The folder of this part, which the release lays out as `tools/parts/build/`: the layer of the build tools is two
  // above it there, and in the repository two above it is the repository itself, which holds no npm of its own.
  const tools = join(fileURLToPath(new URL('../', import.meta.url)), '..', '..')
  let found: string | undefined
  try {
    found = join(dirname(createRequire(import.meta.url).resolve('npm/package.json')), 'bin', 'npm-cli.js')
  } catch {
    found = undefined
  }
  return [join(tools, ...inside), ...(found ? [found] : [])]
}

/**
 * Takes where a runtime lies, the running one where none is named. Answers where the npm lies that it came with:
 * beside the runtime on Windows, and under `lib` beside its folder elsewhere; for the running one, first the npm
 * that the build tools ship in a release, beside the player in `tools/`. Nothing where there is none.
 */
export function npmProgram(runtime?: string): string | undefined {
  const home = dirname(runtime ?? process.execPath)
  const inside = ['node_modules', 'npm', 'bin', 'npm-cli.js']
  const shipped = runtime === undefined ? shippedNpm(inside) : []
  return [...shipped, join(home, ...inside), join(home, '..', 'lib', ...inside)].find((lies) => existsSync(lies))
}

// How long npm may take where its caller says nothing: an install of a large project over a slow network, and no
// wait with no end.
const npmTime = 15 * 60 * 1000

/**
 * Takes a folder, the words to hand npm, and how long it may take, fifteen minutes where it says nothing. Carries npm
 * out there, as a program of its own under the running runtime, and waits for it. Answers the number it ended with
 * and everything it said. Throws where the runtime came with no npm, where npm could not be started, and where it
 * took longer than its time.
 */
export function npm(folder: string, words: string[], o: { timeout?: number } = {}): { status: number; said: string } {
  const lies = npmProgram()
  if (!lies) throw new Error('The runtime came with no npm, which installs the packages of a project.')
  const ended = spawnSync(process.execPath, [lies, ...words], {
    cwd: folder,
    encoding: 'utf8',
    timeout: o.timeout ?? npmTime,
  })
  if (ended.error) throw ended.error
  return { status: ended.status ?? 1, said: `${ended.stdout}${ended.stderr}`.trim() }
}
