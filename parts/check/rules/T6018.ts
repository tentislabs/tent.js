import type { Rule } from '../rule.ts'
import { servedFindings } from '../served.ts'

/**
 * Inside a component that is drawn on the server alone, what lives in the browser: `state`, `set`, a `Form`,
 * `useField`, a hook, an event handler; and another export of its file.
 */
export const rule: Rule = {
  code: 'T6018',
  needs: ['source'],
  run: ({ source }) => servedFindings(source),
}
