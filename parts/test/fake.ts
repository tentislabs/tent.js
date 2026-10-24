import { TentError } from '../core/index.ts'
import type { App, Provider } from '../engine/index.ts'
import type { FakedModel, ModelAnswers } from './fakeModel.ts'
import { fakeModel } from './fakeModel.ts'

/** What a faked service was sent, in order. */
export interface Faked {
  readonly sent: { call: string; input: unknown; once?: string }[]
}

/** The answers of a fake: each the answer of a call, or a function of its input that gives it or throws. */
export type Answers = Record<string, unknown>

/** Whether what a test hands is what a model is faked with: a list, a function, or a record of calls of a model. */
const isModelAnswers = (value: unknown): value is ModelAnswers =>
  Array.isArray(value) || typeof value === 'function' || (typeof value === 'object' && value !== null)

/** Whether what a test hands is what a service is faked with: a record of its calls. */
const isServiceAnswers = (value: unknown): value is Answers =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** What a fake holds: its answers, and what it was sent. */
interface Held {
  answers: Answers
  faked: Faked
}

/**
 * An object whose every member is a call that `call` makes of its name. A stand-in is no promise: `then` names
 * no call of it.
 */
const callsOf = (call: (name: string) => unknown): object =>
  new Proxy({}, { get: (_, name) => (name === 'then' || typeof name === 'symbol' ? undefined : call(name)) })

/** A stand-in of a service that no test faked: each call fails, and reaches nothing outside. */
const notFaked = (service: string): object =>
  callsOf((call) => () => {
    throw new TentError(
      'T7115',
      `The service ${service} was called as ${call}, and a test app reaches no outside service: fake it with app.fake.`,
      {
        fix: `Fake it with \`app.fake('${service}', { ${call}: answer })\`, or name it in \`real\` of \`testApp\`.`,
      },
    )
  })

/** A stand-in that answers as a fake says, and keeps what each call was sent. */
const fakedBy = (service: string, held: Held): object =>
  callsOf((call) => async (input: unknown, how?: { once?: string }) => {
    held.faked.sent.push({ call, input, ...(how?.once === undefined ? {} : { once: how.once }) })
    if (!Object.hasOwn(held.answers, call))
      throw new TentError('T7115', `The fake of ${service} gives no answer for ${call}.`, {
        fix: `Give \`${call}\` among the answers of \`app.fake('${service}', ...)\`.`,
      })
    const answer = held.answers[call]
    return typeof answer === 'function' ? Reflect.apply(answer, undefined, [input]) : answer
  })

/** The name that a test names a service or a model by: its name, or the definition itself. */
const nameOf = (target: unknown): string =>
  typeof target === 'string' ? target : String(Reflect.get(Object(target), 'definition'))

/**
 * The fakes of a test app. `standIns` puts a stand-in in place of every service but those that `real` names, so
 * a test reaches no outside service by accident, and in place of each model that was faked. `fake(service,
 * answers)` puts the answers in its place and keeps what each call was sent; `fake(service)` answers what that
 * fake was sent so far. A model is faked the same way, with the answers of `fakeModel`.
 */
export function fakesOf(
  app: () => App,
  real: string[],
): { fake(target: unknown, answers?: Answers | ModelAnswers): Faked & FakedModel; standIns(): void } {
  const made = new Map<string, Held>()
  const models = new Map<string, { provider: Provider; faked: FakedModel }>()
  return {
    fake(target, answers) {
      const service = nameOf(target)
      if (Object.hasOwn(app().description.models, service)) {
        const kept = models.get(service)
        if (answers === undefined) {
          if (!kept) throw new TentError('T0013', `The model ${service} was not faked in this test.`)
          return kept.faked
        }
        const one = fakeModel(service, isModelAnswers(answers) ? answers : [])
        models.set(service, one)
        app().standIn(service, one.provider)
        return one.faked
      }
      if (answers !== undefined && !isServiceAnswers(answers))
        throw new TentError('T0013', `The service ${service} is faked with a record of its calls.`)
      const held = made.get(service)
      if (answers === undefined) {
        if (!held) throw new TentError('T0013', `The service ${service} was not faked in this test.`)
        return held.faked
      }
      const one: Held = { answers, faked: { sent: held?.faked.sent ?? [] } }
      made.set(service, one)
      app().standIn(service, fakedBy(service, one))
      return one.faked
    },
    standIns() {
      for (const [model, one] of models)
        if (Object.hasOwn(app().description.models, model)) app().standIn(model, one.provider)
      for (const service of Object.keys(app().description.services)) {
        if (real.includes(service)) continue
        const held = made.get(service)
        app().standIn(service, held ? fakedBy(service, held) : notFaked(service))
      }
    },
  }
}
