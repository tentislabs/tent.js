import type { AiEnv, Provider } from '../../ai/index.ts'
import type { Driver, Runner } from '../../flows/index.ts'
import type { Opened } from '../opened.ts'
import { aiEnvOf } from './env.ts'
import { loadAi } from './loaded.ts'
import { providersOf } from './opening.ts'

// The drivers that the makers of each app made, under its handles.
const drivers = new WeakMap<object, Record<string, (env: AiEnv) => Driver>>()

/** Keeps the drivers that the makers of an app made, by the name an agent gives in `driver`. */
export const keepDrivers = (o: Opened, made: Record<string, (env: AiEnv) => Driver>): void =>
  void drivers.set(o.handles, made)

/** Whether a description holds an agent. */
export const holdsAgent = (o: Opened): boolean =>
  Object.values(o.description.flows).some((flow) => flow.agent !== undefined)

/**
 * Takes an app and its runner. Where the app holds an agent, gives the runner the one driver of the kind
 * `agent`: for each run it hands the run to the driver its record names, made in `engine.ts` from the `env`
 * ours is made from, and to the driver of `ai` otherwise. Its steps are tried once: a tool that fails is told to
 * the model.
 */
export async function driveAgents(
  o: Opened,
  runner: Runner,
  providers: Record<string, Provider> = providersOf(o),
): Promise<void> {
  if (!holdsAgent(o)) return
  const ai = await loadAi()
  const env = aiEnvOf(o, providers)
  const sequenced = Object.entries(o.description.flows).filter(
    ([, flow]) => Reflect.get(Object(flow.agent), 'sequence') === true,
  )
  // Without the reader of source no sequence can be read: the log says so once, when the app opens.
  if (!env.read && sequenced.length)
    o.log.write('lines', {
      at: o.clock.now(),
      level: 'info',
      message: `No reader of source was handed to the engine, so ${sequenced.map(([name]) => name).join(', ')} offer no sequence: they work by tool calls alone.`,
      data: JSON.stringify({
        fix: 'Start the app with the build tools installed, as `tent start` does, to offer sequences.',
      }),
    })
  const ours = ai.agentDriver(env)
  const made = new Map<string, Driver>()
  runner.drive(
    'agent',
    (run) => {
      const named: unknown = Reflect.get(Object(Reflect.get(Object(run.record), 'agent')), 'driver')
      const maker = typeof named === 'string' ? drivers.get(o.handles)?.[named] : undefined
      if (typeof named !== 'string' || !maker) return ours(run)
      const driver = made.get(named) ?? maker(env)
      made.set(named, driver)
      return driver(run)
    },
    { tries: 1 },
  )
}
