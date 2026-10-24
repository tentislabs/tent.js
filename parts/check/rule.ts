import type { Declared, Node, Source } from '../build/index.ts'
import { lineOf, scan } from '../build/index.ts'
import type { Finding } from '../core/index.ts'
import type { Description, Facts } from '../core/internal.ts'
import { finding, isStored } from '../core/internal.ts'
import { statedAt } from './stated.ts'

/** The form of a rule of the check: its code, what it needs, and its work. */
export interface Rule {
  code: string
  needs: ('description' | 'source' | 'facts')[]
  // A rule that reads one file at a time, and nothing of another file or of the description: at a save it is
  // carried out over the files that changed alone.
  reads?: 'file'
  run(o: { description: Description; source: Source; facts?: Facts }): Finding[]
}

/** One definition as its file writes it, with its file and its line. */
export interface Written {
  name: string
  word: string
  path: string
  text: string
  line: number
  declared: Declared
  // The words of tentjs that its file imports, by the local name it gives each: `now as clock` is `clock` to `now`.
  words: Map<string, string>
  // The tree of its file.
  tree?: Node
}

const seen = new WeakMap<Source, Written[]>()

/** Every definition that the files of a project write, in the order of the files. */
export function writtenIn(source: Source): Written[] {
  const held = seen.get(source)
  if (held) return held
  const found: Written[] = []
  for (const [path, file] of Object.entries(source).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const scanned = file.tree ? scan(file.tree) : undefined
    const words = new Map(
      (scanned?.imports ?? []).filter((one) => /^tentjs(?:\/|$)/.test(one.from)).map((one) => [one.local, one.name]),
    )
    for (const declared of scanned?.declared ?? [])
      found.push({
        name: declared.name ?? declared.exportName,
        word: declared.word,
        path,
        text: file.text,
        line: lineOf(file.text, declared.statement.start),
        declared,
        words,
        ...(file.tree ? { tree: file.tree } : {}),
      })
  }
  seen.set(source, found)
  return found
}

/** The arrow that a definition writes as an option, or nothing where the option is no arrow. */
export function arrowOf(written: Written, option: string): Node | undefined {
  const arrow = statedAt(written, [option])
  return arrow && /^(?:Arrow)?FunctionExpression$/.test(arrow.type) ? arrow : undefined
}

/** A finding of a rule, at a definition, or at a node of its file where one is given. */
export function at(
  code: string,
  written: Written,
  node: Node | undefined,
  message: string,
  fix: string,
  level: Finding['level'] = 'error',
): Finding {
  const line = node ? lineOf(written.text, node.start) : written.line
  return finding(
    code,
    `${written.name}: ${message}`,
    { fix, where: { file: written.path, line, definition: written.name } },
    level,
  )
}

/** Calls `see` for a stored value and for every record inside it. */
export function inside(value: unknown, see: (record: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) for (const one of value) inside(one, see)
  else if (isStored(value)) {
    see(value)
    for (const one of Object.values(value)) inside(one, see)
  }
}
