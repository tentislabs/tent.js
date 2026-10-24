import type { Finding } from '../../../core/index.ts'
import { unreachedWhy, isStored, projectLanguages } from '../../../core/internal.ts'
import type { Rule } from '../../rule.ts'
import { at, writtenIn } from '../../rule.ts'

/**
 * A route whose address no request can reach: a path that does not start with `/`, one under `/_t/`, where the
 * addresses of the engine lie, and one whose first part is the code of a language of the project. A route may lie
 * under `/api/`.
 */
export const rule: Rule = {
  code: 'T1014',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const languages = projectLanguages(description.project)
    const found: Finding[] = []
    for (const route of writtenIn(source).filter((one) => one.word === 'route')) {
      const stored = Object.hasOwn(description.routes, route.name) ? description.routes[route.name] : undefined
      const path = isStored(stored) ? stored.path : undefined
      const why = typeof path === 'string' ? unreachedWhy(path, languages) : undefined
      if (why !== undefined)
        found.push(
          at(
            'T1014',
            route,
            undefined,
            `its \`path\` ${why}.`,
            'Give the route an address of its own, which starts with `/`.',
          ),
        )
    }
    return found
  },
}
