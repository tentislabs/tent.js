import type { Finding } from '../../core/index.ts'
import { fitted } from '../addresses.ts'
import type { Rule, Written } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'

/** Two screens with one address: two paths that fit exactly the same addresses. */
export const rule: Rule = {
  code: 'T6007',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const first = new Map<string, { screen: Written; path: string }>()
    const found: Finding[] = []
    for (const screen of writtenIn(source).filter((one) => one.word === 'screen')) {
      const stored = Object.hasOwn(description.screens, screen.name) ? description.screens[screen.name] : undefined
      const path = stored?.path
      if (typeof path !== 'string') continue
      const taken = first.get(fitted(path))
      if (!taken) first.set(fitted(path), { screen, path })
      else
        found.push(
          at(
            'T6007',
            screen,
            undefined,
            `its path \`${path}\` fits exactly the addresses of \`${taken.screen.name}\`, whose path is \`${taken.path}\`: one of the two could never be reached.`,
            'Give one of the two screens another `path`.',
          ),
        )
    }
    return found
  },
}
