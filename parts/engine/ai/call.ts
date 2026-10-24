import type { Method } from '../../ai/index.ts'
import { TentError } from '../../core/index.ts'
import type { CallContext } from '../context.ts'
import { atOf } from '../flows/inside.ts'
import { aiEnvOf } from './env.ts'
import { keyOfCall, withKey } from './kept.ts'
import { aiIfLoaded, loadAi } from './loaded.ts'
import { providersOf } from './opening.ts'

const fixed: readonly string[] = ['reply', 'stream', 'fill', 'embed', 'hear', 'speak', 'rank']

/** Whether a name is one of the seven fixed calls of a model. */
const isFixed = (name: string): name is Exclude<Method, 'call'> => fixed.includes(name)

/**
 * Takes the call context of code and a name it calls. Answers the model and the call where the name is a model
 * call of the version the call runs on: `<model>.<call>` for one of the seven fixed calls, and the model itself for
 * one that is a function. Nothing for any other name.
 */
export function modelCallOf(cx: CallContext, name: string): { model: string; method: Method } | undefined {
  const { models } = cx.app.description
  if (Object.hasOwn(models, name)) return { model: name, method: 'call' }
  const dot = name.lastIndexOf('.')
  if (dot < 0) return undefined
  const [model, method] = [name.slice(0, dot), name.slice(dot + 1)]
  return Object.hasOwn(models, model) && isFixed(method) ? { model, method } : undefined
}

/** The signal of a model call: it ends with the call it is made in, and with the time of an action that makes it. */
function signalOf(cx: CallContext): { signal: AbortSignal; done(): void } {
  const left = cx.work.ends - performance.now()
  if (!Number.isFinite(left)) return { signal: cx.signal, done: () => undefined }
  const time = new AbortController()
  const timer = setTimeout(
    () =>
      time.abort(
        new TentError('T0008', `The time of ${cx.work.name} ended while a model call waited.`, {
          fix: 'Give the work more time in its `limits`, or call the model in a step of a flow.',
        }),
      ),
    Math.max(0, left),
  )
  timer.unref()
  return { signal: AbortSignal.any([cx.signal, time.signal]), done: () => clearTimeout(timer) }
}

/**
 * Takes the call context of code, the model call and what it was handed. Carries the call out through the model
 * layer of `ai`, in the call context's version, for its caller, where it stands in a run, and held to the time of
 * the work it is made in: in a query, a change and the arrow of a rule it is T0013. A long job of it is kept under
 * the once-only key of its place inside a step. Answers what the call answers: a promise, and for `stream` the
 * parts as they arrive.
 */
export function callModel(cx: CallContext, name: string, args: unknown[]): unknown {
  const asked = modelCallOf(cx, name)
  if (!asked) throw new TentError('T0001', `No model call named ${JSON.stringify(name).slice(0, 80)} can be reached.`)
  const { kind } = cx.work
  if (kind === 'query' || kind === 'change' || kind === 'rule')
    throw new TentError('T0013', `The model call ${name} was made in the ${kind} ${cx.work.name}.`, {
      fix: 'Call a model from an action, a route or a step of a flow.',
    })
  const at = atOf(cx)
  const place = at?.step ? { run: at.run, step: at.step.name, repeat: at.step.repeat } : undefined
  const key = keyOfCall(cx, name, args[0])
  const { signal, done } = signalOf(cx)
  const made = (ai: Awaited<ReturnType<typeof loadAi>>): unknown =>
    withKey(key, () =>
      ai.modelCall(aiEnvOf(cx.app, providersOf(cx.app)), {
        model: asked.model,
        method: asked.method,
        args,
        caller: cx.caller,
        version: cx.version,
        signal,
        ...(place ? { at: place } : {}),
      }),
    )
  const ai = aiIfLoaded()
  // A version that holds a model where the one the app opened with held none loads the part at its first call.
  const answer = ai ? made(ai) : loadAi().then(made)
  if (answer instanceof Promise) answer.then(done, done)
  else done()
  return answer
}
