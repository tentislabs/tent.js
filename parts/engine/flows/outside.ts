import { TentError } from '../../core/index.ts'
import type { CallContext } from '../context.ts'

// The members of the handles that only read: a flow may use them between two steps.
const reading = [
  ...['sessions.list', 'connections.list', 'keys.list', 'grants.list', 'workspaces.get', 'workspaces.list'],
  ...['workspaces.turns', 'workspaces.mail', 'files.get', 'files.stream', 'files.info', 'files.text'],
  ...['passwords.check', 'passwords.old', 'runs.read', 'runs.find', 'runs.paused'],
]

/** Whether a member of a handle, as `<handle>.<member>`, only reads. */
export const onlyReads = (member: string): boolean => reading.includes(member)

// The handles of which every member may be used between two steps: a value that is read, and a line of the log.
const free = ['settings', 'secrets', 'log']

/** Whether a call context is that of the code of a flow between two steps, which runs again on every pass. */
export const betweenSteps = (cx: CallContext): boolean => cx.run !== undefined && cx.run.step === undefined

/** The error of work that the code of a flow does outside a step. */
export const outsideStep = (cx: CallContext, what: string): TentError =>
  new TentError(
    'T5001',
    `${what} was used in the flow ${cx.work.name} outside a step, where the code runs again on every pass.`,
    {
      fix: "Do it inside a step: `await step('a name', () => ...)`. The time and a random number between steps are `step.now()` and `step.random()`.",
    },
  )

/**
 * Takes the working object behind a handle, its name, and the call context of code between two steps of a flow.
 * Answers the handle as that code may use it: a member that only reads works, and every other member throws T5001.
 */
export function readingOnly(working: object, name: string, cx: CallContext): object {
  if (free.includes(name)) return working
  const held: Record<string, unknown> = {}
  for (const member of Object.keys(working)) {
    const made: unknown = Reflect.get(working, member)
    held[member] =
      typeof made !== 'function' || reading.includes(`${name}.${member}`)
        ? made
        : () => {
            throw outsideStep(cx, `\`${name}.${member}\``)
          }
  }
  return held
}
