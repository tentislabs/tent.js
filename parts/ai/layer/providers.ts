import { TentError } from '../../core/index.ts'
import { shippedProviders } from '../../core/internal.ts'
import type { AiEnv, Provider } from '../face.ts'
import { anthropic } from '../providers/anthropic.ts'
import { google } from '../providers/google.ts'
import { openai } from '../providers/openai.ts'
import { openaiStyle } from '../providers/openaiStyle.ts'
import { serviceProvider } from '../providers/service.ts'
import type { ModelOf } from './record.ts'

// The providers that ship, by the names a model gives in `provider`. `service` is made over the calls of an app.
const shipped: Record<string, Provider> = { anthropic, openai, 'openai-style': openaiStyle, google }

/** Whether a provider ships: one of the four that write, or `service`. */
export const ships = (name: string): boolean => shippedProviders.includes(name)

/**
 * Takes what the engine hands `ai`, a model, and the version it is called on. Answers its provider: a stand-in of
 * a test, one made in `engine.ts` by the name the model gives, and otherwise one that ships. Throws T7113 for a
 * name that is neither.
 */
export function providerOf(env: AiEnv, model: ModelOf, version: string): Provider {
  const named = String(model.stored.provider)
  const standIn = env.standIn?.(model.name)
  if (standIn) return standIn
  const made = Object.hasOwn(env.providers, named) ? env.providers[named] : undefined
  if (made) return made
  if (named === 'service') return serviceProvider(env, version, { ...model.stored, name: model.name })
  if (Object.hasOwn(shipped, named)) return shipped[named]
  throw missing(model.name, named)
}

/** The error of a model that names a provider which neither ships nor is made. */
export const missing = (model: string, provider: string): TentError =>
  new TentError(
    'T7113',
    `The model ${model} names the provider ${provider}, which neither ships nor is made in \`engine.ts\`.`,
    {
      fix: `Make it in \`providers\` of the makers of \`engine.ts\`, by the name ${provider}, or name a provider that ships.`,
    },
  )
