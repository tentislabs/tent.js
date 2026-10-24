import { child, nameOf, unwrap } from '../../build/index.ts'
import type { Description } from '../../core/internal.ts'
import { arrowsOfFlow, callsOfFlow } from '../flowCode.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'

// The handles of which every member may be used between two steps, and the members of the others that only read.
const free = ['settings', 'secrets', 'log']
const reading = [
  ...['sessions.list', 'connections.list', 'keys.list', 'grants.list', 'workspaces.get', 'workspaces.list'],
  ...['workspaces.turns', 'workspaces.mail', 'files.get', 'files.stream', 'files.info', 'files.text'],
  ...['passwords.check', 'passwords.old', 'runs.read', 'runs.find'],
]
const handles = [
  ...['sessions', 'attempts', 'roles', 'connections', 'keys', 'workspaces', 'grants', 'settings', 'secrets', 'log'],
  ...['passwords', 'mail', 'files', 'verified', 'runs'],
]

// The words that are drawn: a later pass would draw another value.
const drawn = ['now', 'random', 'token']

/**
 * What a call of that name does that a flow may not do between two steps, in words, or nothing where it may. A
 * word of tentjs is told by `word`: a function of the file's own that bears the name of one is none.
 */
function workOf(description: Description, name: string, word: boolean): string | undefined {
  const [first, member] = name.split('.')
  if (member === undefined) {
    if (word && drawn.includes(name)) return `it draws a value, \`${name}()\`, which a later pass would draw anew`
    if (word && name === 'start') return 'it starts a run with `start`'
    const fn = Object.hasOwn(description.functions, name) ? description.functions[name] : undefined
    if (fn && fn.kind !== 'query') return `it calls the ${String(fn.kind)} \`${name}\``
    if (Object.hasOwn(description.flows, name))
      return `it calls the ${description.flows[name].agent === undefined ? 'flow' : 'agent'} \`${name}\``
    if (Object.hasOwn(description.models, name)) return `it calls the model \`${name}\``
    return undefined
  }
  if (Object.hasOwn(description.services, first)) return `it calls the service \`${name}\``
  if (Object.hasOwn(description.models, first)) return `it calls the model \`${name}\``
  if (Object.hasOwn(description.flows, first) && member !== 'working') return `it calls \`${name}\``
  if (handles.includes(first) && !free.includes(first) && !reading.includes(`${first}.${member}`))
    return `it uses \`${name}\`, which does more than read`
  return undefined
}

/**
 * A flow does work outside a step: a change, an action, a call of a service or of a model, a call of a flow or of
 * an agent, `start`, a member of a handle that does more than read, or a word that is drawn.
 */
export const rule: Rule = {
  code: 'T5001',
  needs: ['description', 'source'],
  run: ({ description, source }) =>
    writtenIn(source)
      .filter((one) => one.word === 'flow')
      .flatMap((flow) =>
        arrowsOfFlow(flow).flatMap((code) =>
          callsOfFlow(code, flow.words).between.flatMap((call) => {
            const local = nameOf(unwrap(child(call.node, 'callee')))
            const work = workOf(description, call.name, local !== undefined && flow.words.get(local) === call.name)
            return work === undefined
              ? []
              : [
                  at(
                    'T5001',
                    flow,
                    call.node,
                    `${work}, outside a step. The code between two steps runs again on every pass of a run.`,
                    "Do it inside a step: `await step('a name', () => ...)`. The time and a random number between steps are `step.now()` and `step.random()`.",
                  ),
                ]
          }),
        ),
      ),
}
