import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type Unit = 'ms' | 'bytes' | 'percent'
// `owed` says why the owner lets the release stand above the bar until it is reached.
type Bar = { bar: number; unit: Unit; owed?: string }

/** Reads the bar of a name from `budgets.json` in the folder the program was started in. Throws on a line of another form. */
function barOf(name: string): Bar | undefined {
  if (!existsSync('budgets.json')) return undefined
  const bars: Record<string, Partial<Bar> | undefined> = JSON.parse(readFileSync('budgets.json', 'utf8'))
  const line = Object.hasOwn(bars, name) ? bars[name] : undefined
  if (line === undefined) return undefined
  if (
    typeof line.bar !== 'number' ||
    (line.unit !== 'ms' && line.unit !== 'bytes' && line.unit !== 'percent') ||
    (line.owed !== undefined && typeof line.owed !== 'string')
  )
    throw new Error(`budgets.json holds the bar of ${name} in another form than { bar, unit, owed? }`)
  return { bar: line.bar, unit: line.unit, ...(line.owed !== undefined && { owed: line.owed }) }
}

/**
 * Measures `run` under `name`. Takes the name, what is measured, and in `unit` the unit of the measure where the name
 * has no bar, and with `warm` one call before the five that is not counted. `run` is called five times: where it
 * answers a number, also by a promise, that is the measure, and otherwise the time of the call in milliseconds.
 * Answers a promise of the middle one of the five, which it has written to `results/parts/measure.<name>.json` under
 * the folder the program was started in, with the bar of the name in `budgets.json` there. The promise is refused
 * where the middle one is above a bar that is not owed, where `run` throws, where a measure is no number, and where
 * `unit` is not the unit of the bar.
 */
export async function measure(
  name: string,
  run: () => unknown,
  options: { unit?: Unit; warm?: boolean } = {},
): Promise<number> {
  const line = barOf(name)
  const unit = options.unit ?? line?.unit ?? 'ms'
  if (line && line.unit !== unit) throw new Error(`the measure ${name} is in ${unit}, and its bar in ${line.unit}`)
  if (options.warm) await run()
  const measures: number[] = []
  for (let k = 0; k < 5; k++) {
    const before = performance.now()
    const answer = await run()
    const one = typeof answer === 'number' ? answer : performance.now() - before
    if (!Number.isFinite(one)) throw new Error(`a measure of ${name} is no number: ${one}`)
    measures.push(one)
  }
  return held(name, measures.sort((a, b) => a - b)[2], unit)
}

/**
 * Holds a number that a test worked out itself under `name`, as `measure` holds the middle one of its five: takes
 * the name, the number and its unit. Writes it to `results/parts/measure.<name>.json` with the bar of the name, and
 * answers it. Throws where it is above a bar that is not owed, where it is no number, and where `unit` is not the
 * unit of the bar.
 */
export function held(name: string, value: number, unit: Unit): number {
  const line = barOf(name)
  if (line && line.unit !== unit) throw new Error(`the measure ${name} is in ${unit}, and its bar in ${line.unit}`)
  if (!Number.isFinite(value)) throw new Error(`a measure of ${name} is no number: ${value}`)
  const parts = join('results', 'parts')
  mkdirSync(parts, { recursive: true })
  writeFileSync(
    join(parts, `measure.${name}.json`),
    `${JSON.stringify({ value, unit, ...(line && { bar: line.bar }) })}\n`,
  )
  if (line && value > line.bar) {
    const said = `the measure ${name} is ${value} ${unit}, above its bar of ${line.bar}`
    if (line.owed === undefined) throw new Error(said)
    // The automatic runs show a line of this form among the warnings of the run, where it is read without the log.
    console.log(`${process.env.GITHUB_ACTIONS === 'true' ? '::warning::' : ''}${said}, which is owed: ${line.owed}`)
  }
  return value
}
