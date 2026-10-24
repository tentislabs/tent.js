import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type Unit = 'ms' | 'bytes'
type Bar = { bar: number; unit: Unit }

/** Reads the bar of a name from `budgets.json` in the folder the program was started in. Throws on a line of another form. */
function barOf(name: string): Bar | undefined {
  if (!existsSync('budgets.json')) return undefined
  const bars: Record<string, Partial<Bar> | undefined> = JSON.parse(readFileSync('budgets.json', 'utf8'))
  const line = Object.hasOwn(bars, name) ? bars[name] : undefined
  if (line === undefined) return undefined
  if (typeof line.bar !== 'number' || (line.unit !== 'ms' && line.unit !== 'bytes'))
    throw new Error(`budgets.json holds the bar of ${name} in another form than { bar, unit }`)
  return { bar: line.bar, unit: line.unit }
}

/**
 * Measures `run` under `name`. Takes the name, what is measured, and in `unit` the unit of the measure where the name
 * has no bar, and with `warm` one call before the five that is not counted. `run` is called five times: where it
 * answers a number, also by a promise, that is the measure, and otherwise the time of the call in milliseconds.
 * Answers a promise of the middle one of the five, which it has written to `results/parts/measure.<name>.json` under
 * the folder the program was started in, with the bar of the name in `budgets.json` there. The promise is refused
 * where the middle one is above its bar, where `run` throws, where a measure is no number, and where `unit` is not
 * the unit of the bar.
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
  const value = measures.sort((a, b) => a - b)[2]
  const parts = join('results', 'parts')
  mkdirSync(parts, { recursive: true })
  writeFileSync(
    join(parts, `measure.${name}.json`),
    `${JSON.stringify({ value, unit, ...(line && { bar: line.bar }) })}\n`,
  )
  if (line && value > line.bar) throw new Error(`the measure ${name} is ${value} ${unit}, above its bar of ${line.bar}`)
  return value
}
