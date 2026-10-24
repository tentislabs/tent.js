import type { Caller, Type } from '../../core/index.ts'
import type { Writer } from '../../history/index.ts'
import type { Policy } from '../policy.ts'
import type { Held, One } from '../state.ts'

/** Where a tool reads the project: in the host for an owner that `trusted` names, and else in the box alone. */
export type Form = 'host' | 'box'

/** Where one project tool is carried out: the workspaces, the workspace the source's context names, and who acts. */
export interface ToolAt {
  held: Held
  one: One
  policy: Policy
  // Where the project is read: as the build reads it in the host, or by the build in the box.
  form: Form
  // The caller the tool acts for, the starter of a run or the caller of the product's code.
  caller: Caller
  // What writes the points that a tool records: the AI in a run, the tool from the product's own code.
  by: Writer
  // The agent's `trust`, by the names it lists.
  trust: string[]
  // Makes the step wait for the person's yes to what is shown, and throws T7111 at their no.
  ask(what: object): Promise<void>
}

/** One project tool: its name, what a model is told of it, its input, whether it writes, and its work. */
export interface ProjectTool {
  name: string
  about: string
  input: Record<string, Type>
  // Whether it writes files of the project; `run` writes data, and is taken away with them in the mode `propose`.
  writes: boolean
  run(at: ToolAt, input: Record<string, unknown>): Promise<unknown>
}
