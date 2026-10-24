import type { Finding } from '../../../core/index.ts'
import type { Offered } from '../../../core/internal.ts'
import { apiNameOf, offeredToApi } from '../../../core/internal.ts'
import { methodsOf } from '../../addresses.ts'
import type { Rule } from '../../rule.ts'
import { at, writtenIn } from '../../rule.ts'

/**
 * A route at the address of a function that is offered to the API, with a method the API answers there: `POST`
 * for every one, and `GET` for a query too. A route under `/api/` is tried before the functions, so the function
 * could never be reached.
 */
export const rule: Rule = {
  code: 'T6007',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const offered = new Map<string, Offered>()
    for (const one of offeredToApi(description)) offered.set(`/api/${apiNameOf(description, one.name)}`, one)
    for (const route of writtenIn(source).filter((each) => each.word === 'route')) {
      const stored: unknown = description.routes[route.name]
      const path: unknown = Reflect.get(Object(stored), 'path')
      const one = typeof path === 'string' ? offered.get(path) : undefined
      if (!one) continue
      const methods = methodsOf(Reflect.get(Object(stored), 'method'))
      const shared = methods.find((method) => method === 'POST' || (method === 'GET' && one.query))
      if (shared)
        found.push(
          at(
            'T6007',
            route,
            undefined,
            `it states \`${shared}\`, and its path \`${String(path)}\` is the address at which the API answers \`${one.name}\`: the function could never be reached there.`,
            'Give the route another `path`, or offer the function under another name with `api.names`.',
          ),
        )
    }
    return found
  },
}
