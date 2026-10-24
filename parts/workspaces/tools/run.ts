import type { Caller } from '../../core/index.ts'
import { json, TentError, text } from '../../core/index.ts'
import { sendsOut } from '../../core/internal.ts'
import { runWorkspace } from '../opening.ts'
import { noteSent } from '../sent.ts'
import type { ProjectTool } from './face.ts'

/** The error of an `as` that names no caller a tool may act as. */
const notAs = (why: string): TentError =>
  new TentError('T0002', `\`as\` of \`run\` ${why}.`, {
    fields: { as: 'type' },
    fix: 'Name the id of a user of this workspace, or leave `as` out to call as nobody.',
  })

/**
 * `run`: calls a function or starts a flow of the workspace's app on its test data, as a user of the workspace or
 * as nobody where `as` is left out, and as the system only where the policy's `also` names `runAsSystem`. Where
 * what it calls sends data out, the person is asked first, unless the agent's `trust` names `run`.
 */
export const runTool: ProjectTool = {
  name: 'run',
  about:
    'Calls a function or starts a flow of the app on its test data, as a user of the app by the id of their row, or as nobody.',
  input: { name: text({ min: 1 }), input: json({ optional: true }), as: text({ optional: true }) },
  writes: true,
  async run(at, input) {
    const app = await runWorkspace(at.held, at.one.workspace.id)
    const name = String(input.name)
    const { functions, flows } = app.description
    const isFunction = Object.hasOwn(functions, name)
    if (!isFunction && !Object.hasOwn(flows, name))
      throw new TentError('T0001', `No function and no flow ${JSON.stringify(name).slice(0, 80)} is in the app.`)
    let as: Caller = { kind: 'nobody' }
    if (input.as === 'system') {
      if (!at.policy.also.includes('runAsSystem')) throw notAs('names the system, which the policy does not let it')
      as = { kind: 'system' }
    } else if (typeof input.as === 'string') {
      const row: unknown = await app
        .read({ from: 'users', one: 'get', id: input.as }, { as: 'system' })
        .catch(() => undefined)
      if (!row) throw notAs('names no user of this workspace')
      const roles: unknown = Reflect.get(Object(row), 'roles')
      as = { kind: 'user', user: { id: input.as, roles: Array.isArray(roles) ? roles.map(String) : [] } }
    }
    if (sendsOut(app.description, name)) {
      // Where `ask` names `run`, the person was asked before the tool began.
      if (!at.trust.includes('run') && !at.policy.ask.includes('run'))
        await at.ask({ tool: 'run', name, input: input.input })
      // What went out is not taken back by an undo: it is written down, so the undo can say so.
      noteSent(at.one, name)
    }
    if (isFunction) return { answer: await app.call(name, input.input ?? {}, { as }) }
    return await app.start(name, input.input ?? {}, { as })
  },
}
