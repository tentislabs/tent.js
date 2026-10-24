import type { Description } from './description.ts'
import { shippedProviders } from './models.ts'

/**
 * The units of the engine's own, which it counts for an app beside the models: a model reports none under one of
 * these names. `calls` is not among them, since every model call is counted under it.
 */
export const engineUnits: readonly string[] = [
  'failed',
  'ms',
  'cpuMs',
  'mainCpuMs',
  'rowsWritten',
  'bytesIn',
  'bytesOut',
  'runs',
  'steps',
  'workedMs',
  'mails',
  'fileByteSeconds',
  'fileBytesPeak',
  'watches',
  'liveSeconds',
  'livePeak',
  'dataByteSeconds',
  'dataBytesPeak',
  'workSeconds',
  'lostSeconds',
  'loadSeconds',
  'idleSeconds',
]

/** The units of what a run used beside those of its model calls: the machine time of its tasks and its own steps. */
export const runUnits: readonly string[] = ['workSeconds', 'lostSeconds', 'cpuMs', 'mainCpuMs', 'workedMs']

/**
 * Takes a description. Answers the units that the models of the project count: those of the fixed calls, `failed`,
 * and the keys of `units` of each model over a service call; and `open`, where a model names a provider that
 * does not ship, which may report any unit, so that nothing can be said of unit names.
 */
export function modelUnitsOf(description: Description): { units: Set<string>; open: boolean } {
  const units = new Set([...fixedUnits, 'failed'])
  let open = false
  for (const model of Object.values(description.models)) {
    if (!shippedProviders.includes(String(model.provider))) open = true
    const stated: unknown = model.units
    if (typeof stated === 'object' && stated !== null) for (const unit of Object.keys(stated)) units.add(unit)
  }
  return { units, open }
}

/** The units of the fixed calls of a model, which are always counted. */
export const fixedUnits: readonly string[] = [
  'calls',
  'tokensIn',
  'tokensOut',
  'tokensCached',
  'tokensStored',
  'seconds',
  'characters',
]
