import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const here = createRequire(import.meta.url)

/** The folder of a package, as it is found from a file, or nothing where it is not installed. */
function packageFolder(name: string, from = here): string | undefined {
  try {
    return dirname(from.resolve(`${name}/package.json`))
  } catch {
    return undefined
  }
}

/** The folder that holds the types of the runtime's own modules, or nothing where they are not installed. */
export function runtimeTypes(): string | undefined {
  const folder = packageFolder('@types/node')
  return folder ? dirname(folder) : undefined
}

/** Where the program of the type checker lies: in the package of this system, which the type checker brings. */
function program(): string | undefined {
  const main = packageFolder('typescript')
  if (!main) return undefined
  const system = packageFolder(
    `@typescript/typescript-${process.platform}-${process.arch}`,
    createRequire(join(main, 'package.json')),
  )
  const lies = system ? join(system, 'lib', process.platform === 'win32' ? 'tsc.exe' : 'tsc') : undefined
  return lies && existsSync(lies) ? lies : undefined
}

/**
 * Takes the folder to start in, and the words to hand the type checker. Starts it, as a program of its own.
 * Answers the program. Throws where the type checker is not installed for this system.
 */
export function startChecker(folder: string, words: string[]): ChildProcess {
  const lies = program()
  if (!lies) throw new Error('the type checker is not installed for this system')
  // The program itself is started, and not the script that the package starts it by, so that ending it ends the
  // type checker and leaves nothing running behind a script.
  return spawn(lies, words, { cwd: folder, stdio: ['ignore', 'pipe', 'pipe'] })
}
