import type { Provider } from '../../ai/index.ts'
import type { Description } from '../../core/internal.ts'
import type { MakerInput, Makers } from '../makers.ts'
import type { Opened } from '../opened.ts'
import { TentError } from '../../core/index.ts'
import { keepDrivers } from './driving.ts'
import { loadAi } from './loaded.ts'

// The providers that the makers of each app made, under its handles.
const made = new WeakMap<object, Record<string, Provider>>()

/** Answers the providers that the makers of an app made, by the names a model gives in `provider`. */
export const providersOf = (o: Opened): Record<string, Provider> => made.get(o.handles) ?? {}

/** Keeps the providers of an app that a worker serves: those that the makers of the worker's program made. */
export function keepProviders(o: Opened, providers: Record<string, Provider>): void {
  made.set(o.handles, providers)
}

/**
 * Takes an app, its description, and its makers with what they are handed. An app that holds a model loads `ai`,
 * has its makers make its providers, and keeps them. Throws T7113 where a model names a provider that neither
 * ships nor was made: the app does not open. An app that holds no model loads nothing of `ai`.
 */
export async function keepModels(
  o: Opened,
  description: Description,
  makers: Makers,
  input: MakerInput,
): Promise<void> {
  const models = Object.entries(description.models)
  if (!models.length) return
  const { missing, ships } = await loadAi()
  const providers = makers.providers?.(input) ?? {}
  for (const one of Object.values(providers)) o.made.push(one)
  for (const [name, model] of models) {
    const provider = String(model.provider)
    if (!ships(provider) && !Object.hasOwn(providers, provider)) throw missing(name, provider)
  }
  made.set(o.handles, providers)
  // An agent that names a driver nobody made stops the opening too.
  const drivers = makers.drivers?.(input) ?? {}
  for (const [name, flow] of Object.entries(description.flows)) {
    const driver: unknown = Reflect.get(Object(flow.agent), 'driver')
    if (typeof driver === 'string' && !Object.hasOwn(drivers, driver))
      throw new TentError(
        'T7114',
        `The agent ${name} names the driver ${driver}, which nobody made in \`engine.ts\`.`,
        {
          fix: `Make it in \`drivers\` of the makers of \`engine.ts\`, by the name ${driver}, or take \`driver\` away.`,
        },
      )
  }
  keepDrivers(o, drivers)
}
