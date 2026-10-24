/** A span of a trace as `tent logs --trace` is answered it, as far as its text needs it. */
interface Shown {
  name: string
  kind: string
  ms: number
  ok: boolean
  code?: string
  slowest: boolean
  under: Shown[]
  rows: { table: string; row: Record<string, unknown> }[]
}

/**
 * Takes the id of a trace and its spans as a tree. Answers the text that `tent logs --trace` prints: each span on a
 * line, under its parent, with its length and its outcome, the rows of the log written in it beneath, and the
 * slowest path marked.
 */
export function traceText(trace: string, spans: Shown[]): string {
  const lines: string[] = [`trace ${trace}`]
  const walk = (span: Shown, depth: number): void => {
    const outcome = span.ok ? 'ok' : (span.code ?? 'failed')
    lines.push(
      `${'  '.repeat(depth)}${span.kind} ${span.name}  ${Math.round(span.ms)} ms  ${outcome}${span.slowest ? ' *' : ''}`,
    )
    for (const { table, row } of span.rows)
      lines.push(`${'  '.repeat(depth + 1)}- ${table}: ${String(row.message ?? row.name ?? row.call ?? '')}`)
    for (const child of span.under) walk(child, depth + 1)
  }
  for (const span of spans) walk(span, 0)
  lines.push('* the slowest path')
  return lines.join('\n')
}
