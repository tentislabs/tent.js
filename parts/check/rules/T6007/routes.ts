import type { Finding } from '../../../core/index.ts'
import { fitted, methodsOf } from '../../addresses.ts'
import type { Rule, Written } from '../../rule.ts'
import { at, writtenIn } from '../../rule.ts'

/**
 * A route at the address of another definition: a route that states `GET` and a screen, which is a `GET`, and two
 * routes that state one method, where the two paths fit exactly the same addresses.
 */
export const rule: Rule = {
  code: 'T6007',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const screens = new Map<string, { name: string; path: string }>()
    for (const [name, screen] of Object.entries(description.screens)) {
      const path: unknown = Reflect.get(Object(screen), 'path')
      if (typeof path === 'string' && !screens.has(fitted(path))) screens.set(fitted(path), { name, path })
    }
    const first = new Map<string, { route: Written; path: string }>()
    const found: Finding[] = []
    for (const route of writtenIn(source).filter((one) => one.word === 'route')) {
      const stored = Object.hasOwn(description.routes, route.name) ? description.routes[route.name] : undefined
      const path: unknown = Reflect.get(Object(stored), 'path')
      if (typeof path !== 'string') continue
      const methods = methodsOf(Reflect.get(Object(stored), 'method'))
      const screen = methods.includes('GET') ? screens.get(fitted(path)) : undefined
      if (screen)
        found.push(
          at(
            'T6007',
            route,
            undefined,
            `it states \`GET\`, and its path \`${path}\` fits exactly the addresses of the screen \`${screen.name}\`, whose path is \`${screen.path}\`: one of the two could never be reached.`,
            'Give the route another `path`, or leave `GET` out of its `method`.',
          ),
        )
      // Each method of an address is one definition's: the second route that states it is the one that is told.
      let told = false
      for (const method of methods) {
        const key = `${method} ${fitted(path)}`
        const taken = first.get(key)
        if (!taken) first.set(key, { route, path })
        else if (!told) {
          told = true
          found.push(
            at(
              'T6007',
              route,
              undefined,
              `its path \`${path}\` fits exactly the addresses of the route \`${taken.route.name}\`, whose path is \`${taken.path}\`, and both state \`${method}\`: one of the two could never be reached.`,
              'Give one of the two routes another `path`, or another `method`.',
            ),
          )
        }
      }
    }
    return found
  },
}
