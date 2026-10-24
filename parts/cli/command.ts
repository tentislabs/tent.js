import type { Finding, Type } from '../core/index.ts'

/** What every command states: its name, the words and flags it takes, and what it needs. */
interface Stated {
  // A command that is a file of a folder is named by both words, as they are typed: `data rows`.
  name: string
  // What it takes, by name. A value is given as `--name <value>`, or as a word after the name of the command,
  // in the order of this record. A true-or-false one is given as `--name` alone. One whose type is a list may be
  // given several times, as a flag alone, and holds every value in the order they were typed.
  args: Record<string, Type>
  // A command that needs the engine finds it through `--data <folder>`, or through the `.tent/` of its project.
  needs: 'nothing' | 'project' | 'engine'
}

/** A command whose answer the shell prints, as text or with `--json`. */
interface Answering extends Stated {
  raw?: false
  // `folder` is the folder of the project where the command is typed in one, and else the folder it was typed in.
  run(o: { args: Record<string, unknown>; folder: string }): Promise<{ value?: unknown; findings?: Finding[] }>
}

/** A command that prints by itself: the shell prints nothing, and the program ends with the number it answers. */
interface Raw extends Stated {
  raw: true
  // `words` are the words after the name of the command, as they were typed.
  run(o: { words: string[]; folder: string }): Promise<number>
}

/** The form of a command: what it states, and its work. */
export type Command = Answering | Raw
