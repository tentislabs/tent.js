import { isStored } from '../core/internal.ts'

/** One failure of a test, as `tent test --json` holds it in `failures`: where it failed, what came, its last call, its fix. */
export interface Failure {
  test: string
  file: string
  line: number
  expected?: unknown
  got?: unknown
  call?: Record<string, unknown>
  fix?: string
  // The random seed of the test's app: a test app opened with it draws the same numbers again.
  randomSeed?: string
}

// How much of a value one line of a failure shows.
const most = 400

/** A value as a line of a failure shows it: as JSON, cut where it is long. */
function shown(value: unknown): string {
  const text = JSON.stringify(value) ?? String(value)
  return text.length > most ? `${text.slice(0, most)}...` : text
}

/**
 * Takes what the runner tells of a test that failed, its name, its file with the line the runner placed it at, and
 * the lines of the stack that lie in the project. Answers its failure: the line of the test file where it failed,
 * what was expected and what came where two values were held against each other, the last call the test made, as
 * the error carries it, and the fix of the code that refused it.
 */
export function failureOf(error: unknown, test: string, file: string, line: number, places: string[]): Failure {
  const cause: unknown = Reflect.get(Object(error), 'cause')
  const thrown = Object(cause ?? error)
  const at = places.map((place) => new RegExp(`^${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+)`).exec(place))
  const placed = at.find((one) => one !== null)
  const call: unknown = Reflect.get(thrown, 'call')
  const refused: unknown = isStored(call) ? Reflect.get(Object(call.error), 'fix') : undefined
  const fix: unknown = refused ?? Reflect.get(thrown, 'fix')
  const held = Object.hasOwn(thrown, 'actual') && Object.hasOwn(thrown, 'expected')
  const seed: unknown = Reflect.get(Object(error), 'randomSeed') ?? Reflect.get(thrown, 'randomSeed')
  return {
    test,
    file,
    line: placed ? Number(placed[1]) : line,
    ...(held ? { expected: Reflect.get(thrown, 'expected'), got: Reflect.get(thrown, 'actual') } : {}),
    ...(isStored(call) ? { call } : {}),
    ...(typeof fix === 'string' ? { fix } : {}),
    ...(typeof seed === 'string' ? { randomSeed: seed } : {}),
  }
}

/** Whom a call was made as, in words. */
function callerWords(caller: unknown): string {
  const kind = String(Reflect.get(Object(caller), 'kind') ?? 'nobody')
  const user: unknown = Reflect.get(Object(caller), 'user')
  if (!isStored(user)) return kind
  const roles = Array.isArray(user.roles) && user.roles.length ? ` (roles: ${user.roles.join(', ')})` : ''
  return `the user ${String(user.id)}${roles}`
}

/**
 * Takes a failure of a test. Answers it in words, a fact to a line: what was expected and what came, the last call
 * before it with its caller, its input, what it answered or the code that refused it, the definition and the line of
 * the app's own code that failed, the rows it read and the rows it changed before and after, and the trace to follow.
 */
export function failureWords(failure: Failure): string {
  const lines: string[] = []
  if ('expected' in failure) lines.push(`expected: ${shown(failure.expected)}`, `got: ${shown(failure.got)}`)
  const call = failure.call
  if (call) {
    lines.push(`the last call: ${String(call.name)}, as ${callerWords(call.caller)}`, `  input: ${shown(call.input)}`)
    const error: Record<string, unknown> = Object(call.error)
    if (call.error === undefined) lines.push(`  answered: ${shown(call.answer)}`)
    else lines.push(`  refused: ${String(error.code)} ${String(error.message)}`)
    const where: Record<string, unknown> = Object(error.where)
    if (typeof where.file === 'string')
      lines.push(`  ${String(where.definition ?? String(call.name))} at ${where.file}:${String(where.line)}`)
    for (const read of Array.isArray(call.read) ? call.read.filter(isStored) : [])
      lines.push(`  read ${String(read.table)}: ${Array.isArray(read.rows) ? read.rows.length : 0} rows`)
    for (const row of Array.isArray(call.wrote) ? call.wrote.filter(isStored) : [])
      lines.push(
        `  ${String(row.kind)} ${String(row.table)} ${String(row.id)}: ${shown(row.before ?? null)} -> ${shown(row.after ?? null)}`,
      )
    if (typeof call.trace === 'string') lines.push(`  its trace: tent logs --trace ${call.trace}`)
  }
  if (failure.randomSeed !== undefined) lines.push(`random seed: ${failure.randomSeed}`)
  return lines.join('\n')
}
