import { kids } from '../../../build/index.ts'
import type { Finding } from '../../../core/index.ts'
import { fitted, methodsOf } from '../../addresses.ts'
import type { Rule } from '../../rule.ts'
import { at, writtenIn } from '../../rule.ts'
import { statedAt } from '../../stated.ts'
import { isStored } from '../../../core/internal.ts'

/**
 * A redirect at the address of another definition of one method, all of which a redirect is: a screen, a route
 * that states `GET`, which is tried before every redirect, and a second redirect, where the two fit exactly the
 * same addresses.
 */
export const rule: Rule = {
  code: 'T6007',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const project = writtenIn(source).find((one) => one.word === 'project')
    const redirects = Array.isArray(description.project.redirects) ? description.project.redirects : []
    if (!project || !redirects.length) return []
    const written = statedAt(project, ['redirects'])
    const nodes = written?.type === 'ArrayExpression' ? kids(written, 'elements') : []
    const held = new Map<string, string>()
    for (const [name, screen] of Object.entries(description.screens))
      if (typeof screen.path === 'string' && !held.has(fitted(screen.path)))
        held.set(fitted(screen.path), `the screen \`${name}\`, whose path is \`${screen.path}\``)
    const routes = new Map<string, string>()
    for (const [name, route] of Object.entries(description.routes)) {
      const path = isStored(route) ? route.path : undefined
      if (typeof path === 'string' && methodsOf(isStored(route) ? route.method : undefined).includes('GET'))
        routes.set(fitted(path), `the route \`${name}\`, which states \`GET\` at \`${path}\` and is tried first`)
    }
    const found: Finding[] = []
    for (const [n, redirect] of redirects.entries()) {
      const from = isStored(redirect) ? redirect.from : undefined
      if (typeof from !== 'string') continue
      const taken = routes.get(fitted(from)) ?? held.get(fitted(from))
      if (taken)
        found.push(
          at(
            'T6007',
            project,
            nodes[n],
            `the redirect from \`${from}\` fits exactly the addresses of ${taken}: one of the two could never be reached.`,
            'Give the redirect another `from`, or the other definition another `path`.',
          ),
        )
      else held.set(fitted(from), `the redirect from \`${from}\` before it`)
    }
    return found
  },
}
