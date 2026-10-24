// The description finished with what the build made of the project: by the check as it reads it, and by the bundle.
import type { Description } from '../core/internal.ts'
import { finish, fingerprintOf } from '../core/internal.ts'
import { stepNamesOf, usesSql } from './read/code.ts'
import { kid, propertyOf, unwrap } from './tree.ts'
import type { Work } from './work.ts'

/** What the code of the project says that the description holds of it: the step names of each code flow, and what is tied to SQLite. */
function readCode(work: Work): { stepNames: Record<string, object[]>; tiedTo: Record<string, string> } {
  const stepNames: Record<string, object[]> = {}
  const tiedTo: Record<string, string> = {}
  for (const file of work.files.values())
    for (const declared of file.seen?.declared ?? []) {
      const written = kid(propertyOf(declared.options, 'run'), 'value')
      const read = file.arrows.get(declared.exportName)
      if (!written || declared.name === undefined || read?.bodies.run !== undefined) continue
      const run = unwrap(written)
      if (declared.word === 'flow') stepNames[declared.name] = stepNamesOf(run)
      if (usesSql(run)) tiedTo[declared.name] = 'sqlite'
    }
  return { stepNames, tiedTo }
}

/**
 * Takes the work of a build, its description, and the records of what the build wrote for a browser, for the
 * server, for the commands, the API and MCP, where it wrote them. Marks the description of a development build as
 * such, and answers it finished: with the module of each definition, what the code says of each flow, the
 * fingerprint of each source file, and the records handed.
 */
export function finishedOf(
  work: Work,
  description: Description,
  wrote: { browser?: object; server?: object; cli?: object; api?: object; mcp?: object } = {},
): Description {
  if (work.options.for === 'dev') description.app.dev = true
  const sources: Record<string, string> = {}
  for (const file of [...work.files.values()].sort((a, b) => (a.path < b.path ? -1 : 1)))
    sources[file.path] = fingerprintOf(new TextEncoder().encode(file.text))
  return finish(description, { modules: work.modules, ...readCode(work), sources, ...wrote })
}
