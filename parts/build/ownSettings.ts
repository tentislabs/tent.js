// The settings of TypeScript that the builder reads for a project.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// What a project with no `tsconfig.json` is built with: the builder's own defaults, and tags made by the runtime of
// React, as the type check reads them.
const framework = `${JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }, null, 2)}\n`

/**
 * Takes the folder of a project and the folder where its build keeps what it made. Answers the `tsconfig.json`
 * that the builder reads for every file of the project: the project's own where it has one, and else the
 * framework's, written into the second folder. Left to itself the builder takes one from any folder above a file,
 * so a stale one there would break the build.
 */
export function ownSettings(folder: string, kept: string): string {
  const own = join(folder, 'tsconfig.json')
  if (existsSync(own)) return own
  const written = join(kept, 'tsconfig.json')
  if (!existsSync(written) || readFileSync(written, 'utf8') !== framework) writeFileSync(written, framework)
  return written
}
