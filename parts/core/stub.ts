import type { Description } from './description.ts'
import type { MemberName } from './agentTypes.ts'
import { memberNames, memberTypes, startTypes } from './agentTypes.ts'
import type { FieldCheck } from './checks.ts'
import { checksOf } from './checks.ts'
import { isStored } from './record.ts'

/**
 * What a screen holds of a definition: its name and its kind, and for what a screen may call or read the types of
 * its input. It holds no rule, no code and no output.
 */
export interface StubbedDefinition {
  definition: string
  kind: string
  input?: Record<string, unknown>
  // The check of each field of the input that a form makes before it sends, made here from the input's types.
  checks?: Record<string, FieldCheck>
  // On a query: true unless it states `live: false`.
  live?: boolean
  // Of a flow or an action that states `follow`, and of an agent: the query that says how it is doing.
  working?: StubbedDefinition
  // Of an agent: its other three members.
  approve?: StubbedDefinition
  refuse?: StubbedDefinition
  stop?: StubbedDefinition
  // Of a screen: its address, and the names of the state it keeps in the address.
  path?: string
  state?: string[]
}

/** A query that the engine gives beside a definition, as `working` of a flow: its name, and that it is live. */
const member = (name: string, of: string): StubbedDefinition => ({
  definition: `${name}.${of}`,
  kind: 'query',
  input: {},
  checks: {},
  live: true,
})

/** A member of an agent, with its kind and its input: a live query, or an action. */
function agentMember(name: string, of: MemberName): StubbedDefinition {
  const { kind, input } = memberTypes[of]
  return {
    definition: `${name}.${of}`,
    kind,
    input,
    checks: checksOf(input),
    ...(kind === 'query' ? { live: true } : {}),
  }
}

// The maps of a description whose definitions reach a screen as their name and their kind alone.
const named: [map: 'tables' | 'services' | 'models' | 'routes' | 'incoming', kind: string][] = [
  ['tables', 'table'],
  ['services', 'service'],
  ['models', 'model'],
  ['routes', 'route'],
  ['incoming', 'incoming'],
]

/**
 * Takes a description and the name of a definition. Answers what a screen holds of it, the same for the modules
 * that the build makes and for a draw on the server: of a query, a change and an action its input, of a flow its
 * input where it is offered, of a screen its address and the state it keeps there, and of any other kind the name
 * and the kind. A name with a dot is a query that the engine gives beside a definition. Answers nothing for a name
 * that the description does not hold.
 */
export function stubOf(description: Description, name: string): StubbedDefinition | undefined {
  const [first, of] = name.split('.')
  if (of !== undefined) {
    const flow = Object.hasOwn(description.flows, first) ? description.flows[first] : undefined
    const made = Object.hasOwn(description.functions, first) ? description.functions[first] : undefined
    const named = memberNames.find((one) => one === of)
    if (flow?.agent !== undefined) return named ? agentMember(first, named) : undefined
    // `working` of a flow and of an action that states `follow`: a definition that states none has no member.
    const follows = (flow ?? made)?.follow !== undefined
    return of === 'working' && follows ? member(first, of) : undefined
  }
  const made = Object.hasOwn(description.functions, name) ? description.functions[name] : undefined
  if (isStored(made)) {
    const input = isStored(made.input) ? made.input : {}
    const stub: StubbedDefinition = { definition: name, kind: String(made.kind), input, checks: checksOf(input) }
    if (made.kind === 'query') stub.live = made.live !== false
    if (made.follow !== undefined) stub.working = member(name, 'working')
    return stub
  }
  const flow = Object.hasOwn(description.flows, name) ? description.flows[name] : undefined
  // An agent: the input of a start, and its four members.
  if (isStored(flow) && flow.agent !== undefined)
    return {
      definition: name,
      kind: 'agent',
      input: startTypes,
      checks: checksOf(startTypes),
      working: agentMember(name, 'working'),
      approve: agentMember(name, 'approve'),
      refuse: agentMember(name, 'refuse'),
      stop: agentMember(name, 'stop'),
    }
  if (isStored(flow)) {
    const stub: StubbedDefinition = { definition: name, kind: 'flow' }
    // A flow that is offered states `access`, and a screen starts it with its input.
    if (flow.access !== undefined) {
      stub.input = isStored(flow.input) ? flow.input : {}
      stub.checks = checksOf(stub.input)
    }
    if (flow.follow !== undefined) stub.working = member(name, 'working')
    return stub
  }
  const screen = Object.hasOwn(description.screens, name) ? description.screens[name] : undefined
  if (isStored(screen)) {
    const state = Object.entries(isStored(screen.state) ? screen.state : {})
      .filter(([, one]) => isStored(one) && one.in === 'address')
      .map(([key]) => key)
      .sort()
    return {
      definition: name,
      kind: 'screen',
      ...(typeof screen.path === 'string' ? { path: screen.path } : {}),
      state,
    }
  }
  for (const [map, kind] of named) if (Object.hasOwn(description[map], name)) return { definition: name, kind }
  return undefined
}
