import type { Impact } from '../publish/index.ts'
import { impactText } from '../publish/index.ts'
import { processTerminal } from './terminal.ts'

/** What the showing of an impact reaches: the rows of the terminal, a line the person types, and the output. */
export interface ShownReach {
  rows?: number
  line(): Promise<string | undefined>
  write(text: string): void
}

/** The terminal of this program, where a person sits at it: its rows, its lines and its output. */
function ownReach(): ShownReach | undefined {
  // An answer asked for with `--json` is printed whole, as the shape it is, and asks the person nothing.
  if (!process.stdout.isTTY || !process.stdin.isTTY || process.argv.includes('--json')) return undefined
  return {
    rows: process.stdout.rows,
    line: async () => {
      const { terminal, close } = processTerminal()
      try {
        return await terminal.line()
      } finally {
        close()
      }
    },
    write: (text) => void process.stdout.write(text),
  }
}

/**
 * Takes an impact, and what the showing reaches: the terminal of this program where it is left out. Answers its
 * text to be printed. In a terminal of fewer than 30 lines the counts of each part are written first, and each
 * part opens with an Enter, until the person types q or the parts end: what was written is no part of the answer.
 */
export async function impactShown(impact: Impact, reach: ShownReach | undefined = ownReach()): Promise<string> {
  const rows = reach?.rows
  const text = impactText(impact, rows === undefined ? {} : { rows })
  if (!reach || rows === undefined || rows >= 30) return text
  const lines = text.split('\n')
  // A part begins at each line that is not indented, after the heading and the counts.
  const parts: string[][] = []
  for (const line of lines.slice(2))
    if (!line.startsWith(' ') || !parts.length) parts.push([line])
    else parts.at(-1)?.push(line)
  reach.write(`${lines.slice(0, 2).join('\n')}\n`)
  for (const part of parts) {
    reach.write(`Enter opens ${part[0] ?? ''}, q stops. `)
    const typed = await reach.line()
    if (typed === undefined || typed.trim().toLowerCase() === 'q') break
    reach.write(`${part.join('\n')}\n`)
  }
  return ''
}
