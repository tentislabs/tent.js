import { scan } from '../../build/index.ts'
import type { Finding } from '../../core/index.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { agentsOf } from '../agents.ts'

/**
 * An agent that a screen file imports and that states no `access`: nothing reaches it through the door, so the
 * screen would be refused. One that states `offer` with no `access` is T3001, its one code.
 */
export const rule: Rule = {
  code: 'T7010',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    // The names that the files which hold a screen or a component import.
    const viewFiles = new Set(
      writtenIn(source)
        .filter((one) => one.word === 'screen' || one.word === 'component')
        .map((one) => one.path),
    )
    const imported = new Set<string>()
    for (const path of viewFiles) {
      const tree = source[path]?.tree
      for (const one of tree ? scan(tree).imports : []) imported.add(one.name)
    }
    const found: Finding[] = []
    for (const { written, name, record } of agentsOf(description, source)) {
      const flow = description.flows[name]
      if (record.access !== undefined || flow.access !== undefined) continue
      if (!imported.has(written.declared.exportName)) continue
      found.push(
        at(
          'T7010',
          written,
          undefined,
          'it is imported by a screen file and states no `access`: nothing reaches it through the door.',
          "State `access`: who may start it, as `access: 'signedIn'`.",
        ),
      )
    }
    return found
  },
}
