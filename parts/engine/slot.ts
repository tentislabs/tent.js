import { randomBytes, randomInt } from 'node:crypto'
import { TentError } from '../core/index.ts'
import type { Runtime } from '../core/internal.ts'
import type { CallContext } from './context.ts'
import { underWay } from './context.ts'
import { called } from './door/call.ts'
import { betweenSteps, outsideStep, readingOnly } from './flows/outside.ts'
import { handleGiven } from './given.ts'
import { givenHandle } from './givenHandle.ts'
import { limitOf } from './limits.ts'
import { drawRandom, notPure } from './rooms/pure.ts'
import { callService, serviceCallOf } from './services/call.ts'
import { callModel, modelCallOf } from './ai/call.ts'
import { projectZone } from '../core/internal.ts'

/** Answers the call that is under way. Throws T0013 where none is: a maker, and code that runs beside every call. */
function calling(used: string): CallContext {
  const cx = underWay()
  if (!cx)
    throw new TentError('T0013', `${used} was used with no call under way.`, {
      fix: 'A definition and a handle work inside a call: in the `run` of a function, and never in a maker of `engine.ts`.',
    })
  return cx
}

/** The error of a word that reaches a part of the engine which this engine does not have. */
const notThere = (what: string): TentError =>
  new TentError('T0013', `${what} cannot be used here: this engine has nothing behind it.`)

/** A new secret text from the random source of the runtime, or that many digits, each drawn evenly. */
function newToken(o: unknown): string {
  const digits: unknown = Reflect.get(Object(o), 'digits')
  if (typeof digits !== 'number') return randomBytes(32).toString('base64url')
  return Array.from({ length: digits }, () => randomInt(10)).join('')
}

/** Whether the work of a call must answer the same for the same data: a query, and the arrow of a rule. */
const mustBePure = (cx: CallContext): boolean => cx.work.kind === 'query' || cx.work.kind === 'rule'

/**
 * What the engine puts into the runtime slot: the one way by which a word of `core` reaches the work behind it.
 * It knows the app, the caller and the open write of a call through the call context, so a name is enough.
 */
export const slot: Runtime = {
  call(definition, args) {
    const cx = calling(definition)
    // Work on a worker calls through its writer, but a service call and a model call, which the worker makes
    // itself where the `outside` of its kind does not hand them to the writer.
    if (cx.remote) {
      if (serviceCallOf(cx, definition) && !cx.remote.outside.services)
        return import('./work/outsideCall.ts').then(({ calledOnWorker }) => calledOnWorker(cx, definition, args))
      if (modelCallOf(cx, definition) && !cx.remote.outside.models) return callModel(cx, definition, args)
      return cx.remote.call(definition, args[0])
    }
    const { flows } = cx.app
    // Between two steps of a flow the code runs again on every pass: it reads, and calls nothing but a query.
    const { functions } = cx.app.description
    const reads = Object.hasOwn(functions, definition) && functions[definition].kind === 'query'
    if (betweenSteps(cx) && !reads) throw outsideStep(cx, `A call of ${definition}`)
    if (serviceCallOf(cx, definition)) return callService(cx, definition, args)
    if (modelCallOf(cx, definition)) return callModel(cx, definition, args)
    const flow = flows?.call(cx, definition, args[0])
    if (flow) return flow
    const carry = (parent: CallContext): unknown => called(cx.app, definition, args[0], { caller: cx.caller, parent })
    // A change that a step calls is carried out once for its once-only key.
    const once = flows?.once(cx, definition, args[0], carry)
    return once ? once.value : carry(cx)
  },
  handle(name) {
    const cx = calling(name)
    if (cx.remote) return cx.remote.handle(name)
    const own = cx.app.handles.get(name)
    // A handle that a part above the engine gave, as `workspaces`, is handed the caller of each call.
    const given = own ? undefined : handleGiven(cx.app, name)
    const working = own ?? (given ? givenHandle(given, name, cx) : undefined)
    if (!working) throw notThere(`The handle \`${name}\``)
    return betweenSteps(cx) ? readingOnly(working, name, cx) : working
  },
  start(flow, input) {
    const cx = calling(`start of ${flow}`)
    if (betweenSteps(cx)) throw outsideStep(cx, '`start`')
    if (cx.remote)
      return cx.remote.start(typeof flow === 'string' ? flow : String(Reflect.get(Object(flow), 'definition')), input)
    if (!cx.app.flows)
      throw new TentError('T0001', `No flow named ${JSON.stringify(flow).slice(0, 80)} can be started.`, {
        fix: 'Hand `start` a flow of the app.',
      })
    return cx.app.flows.start(cx, flow, input)
  },
  emit(event, data) {
    const cx = calling(`emit of ${event}`)
    if (cx.work.kind !== 'change' || !(cx.tx ?? cx.writing))
      throw new TentError(
        'T0013',
        `\`emit\` was used in the ${cx.work.kind} ${cx.work.name}, and an event is part of the write of a change.`,
        {
          fix: 'Emit an event from a change.',
        },
      )
    cx.app.flows?.emit(cx, event, data)
  },
  draw(word, args) {
    const cx = underWay()
    if (!cx) return undefined
    // A value that is drawn between two steps of a flow would differ on the next pass.
    if (betweenSteps(cx) && (word === 'now' || word === 'random' || word === 'token'))
      throw outsideStep(cx, `\`${word}()\``)
    switch (word) {
      case 'now':
        // One moment for the whole of a query and a change, and the present moment in an action.
        return { value: cx.work.kind === 'action' ? new Date(cx.app.clock.now()) : cx.work.now }
      case 'random':
        if (mustBePure(cx)) throw notPure('drew a random number')
        return { value: drawRandom() }
      case 'token':
        if (mustBePure(cx)) throw notPure('drew a token')
        return { value: newToken(args[0]) }
      case 'zone':
        return { value: projectZone(cx.app.description.project) }
      case 'mayWait':
        return { value: cx.work.kind === 'action' || cx.work.kind === 'seed' }
      case 'valueSize':
        return { value: limitOf(cx.app.description, 'valueSize') }
    }
  },
}
