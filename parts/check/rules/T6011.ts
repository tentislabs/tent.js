import { keyOf, kid, kids, unwrap } from '../../build/index.ts'
import type { Finding } from '../../core/index.ts'
import { heldToType, stateEntries } from '../../core/internal.ts'
import { statesOf } from '../ofViews.ts'
import type { Rule, Written } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { statedAt } from '../stated.ts'
import { entriesOf, isView, literalOf, tagsOf } from '../tags.ts'

const notDeclared = (name: string): string =>
  `\`${name}\` is not declared: it is no state of the view and none of the project.`
const declareIt = 'Declare it in `state` of the screen or of the component, or of the project, or name a state that is.'

/** What a view's own `state` writes against the project: a name that both declare, and a name in `reset` that is no state of the view. */
function ownStates(written: Written, project: Record<string, unknown>): Finding[] {
  const option = statedAt(written, ['state'])
  if (option?.type !== 'ObjectExpression') return []
  const own = new Set(kids(option, 'properties').map((one) => keyOf(one) ?? ''))
  const found: Finding[] = []
  for (const property of kids(option, 'properties')) {
    const name = keyOf(property)
    if (name === undefined) continue
    if (Object.hasOwn(project, name))
      found.push(
        at(
          'T6011',
          written,
          property,
          `the state \`${name}\` is declared by the view and by the project: a view could not tell the two apart.`,
          'Give one of the two another name.',
        ),
      )
    const entry = kid(property, 'value')
    const record = entry ? unwrap(entry) : undefined
    const reset =
      record?.type === 'ObjectExpression' ? kids(record, 'properties').find((one) => keyOf(one) === 'reset') : undefined
    const names = reset ? literalOf(kid(reset, 'value')) : undefined
    if (!reset || !names?.known || !Array.isArray(names.value)) continue
    for (const one of names.value)
      if (typeof one === 'string' && !own.has(one))
        found.push(
          at(
            'T6011',
            written,
            reset,
            `\`reset\` of the state \`${name}\` names \`${one}\`, which is no state of the view.`,
            'Name a state that the view declares.',
          ),
        )
  }
  return found
}

/**
 * `set` of a `Link` and of the `then` of a `Form` naming a state that is not declared, or giving a literal that its
 * type does not take; a name in `reset` that is no state of the view; and a state name that a view and the project
 * both declare.
 */
export const rule: Rule = {
  code: 'T6011',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const tag of tagsOf(source)) {
      const states = statesOf(description, tag.written)
      // What follows a call sets state as a link does.
      const then = (entriesOf(tag.props.get('then')?.value) ?? []).find(([name]) => name === 'set')?.[1]
      const sets = [tag.props.get('set')?.value, then].flatMap((one) => (one ? [one] : []))
      for (const set of sets)
        for (const [name, written] of entriesOf(set) ?? []) {
          if (!Object.hasOwn(states, name)) {
            found.push(at('T6011', tag.written, set, notDeclared(name), declareIt))
            continue
          }
          const value = literalOf(written)
          if (!value.known || value.value === null || heldToType(states[name].type, value.value) !== undefined) continue
          found.push(
            at(
              'T6011',
              tag.written,
              set,
              `\`set\` gives the state \`${name}\` ${JSON.stringify(value.value)}, which its type \`${String(states[name].type.kind)}\` does not take.`,
              'Give a value of the type of the state.',
            ),
          )
        }
    }
    const project = stateEntries(description.project.state)
    for (const written of writtenIn(source).filter(isView)) found.push(...ownStates(written, project))
    return found
  },
}
