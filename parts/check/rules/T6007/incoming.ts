import type { Finding } from '../../../core/index.ts'
import { fitted, methodsOf } from '../../addresses.ts'
import type { Rule, Written } from '../../rule.ts'
import { at, writtenIn } from '../../rule.ts'

/**
 * A call coming in at the address of another definition of one method: a second call coming in of one path, and a
 * route that states `POST` there. A call coming in is a `POST`, so a route of another method shares its path.
 */
export const rule: Rule = {
  code: 'T6007',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const first = new Map<string, { one: Written; path: string }>()
    const written = writtenIn(source)
    for (const one of written.filter((each) => each.word === 'incoming')) {
      const path: unknown = Reflect.get(Object(description.incoming[one.name]), 'path')
      if (typeof path !== 'string') continue
      const taken = first.get(fitted(path))
      if (!taken) first.set(fitted(path), { one, path })
      else
        found.push(
          at(
            'T6007',
            one,
            undefined,
            `its path \`${path}\` fits exactly the addresses of the call coming in \`${taken.one.name}\`, whose path is \`${taken.path}\`: one of the two could never be reached.`,
            'Give one of the two another `path`.',
          ),
        )
    }
    for (const route of written.filter((each) => each.word === 'route')) {
      const stored: unknown = description.routes[route.name]
      const path: unknown = Reflect.get(Object(stored), 'path')
      if (typeof path !== 'string' || !methodsOf(Reflect.get(Object(stored), 'method')).includes('POST')) continue
      const taken = first.get(fitted(path))
      if (taken)
        found.push(
          at(
            'T6007',
            route,
            undefined,
            `it states \`POST\`, and its path \`${path}\` fits exactly the addresses of the call coming in \`${taken.one.name}\`, whose path is \`${taken.path}\`: one of the two could never be reached.`,
            'Give the route another `path`, or leave `POST` out of its `method`.',
          ),
        )
    }
    return found
  },
}
