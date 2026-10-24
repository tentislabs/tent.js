import { action, change, input, json, link, text, workspaces } from 'tentjs'
import { projects } from '../tables/tables'

const held = 'it uses the workspaces of the product, which the handle holds to the caller'

export const addProject = change('addProject', {
  about: 'Adds the project row of a workspace of the caller',
  input: { owner: link('users'), workspace: text() },
  access: 'signedIn',
  set: projects.add({ owner: input('owner'), workspace: input('workspace') }),
})

export const newProject = action('newProject', {
  about: 'Makes a workspace of the caller from a template, with the project row that holds its conversation',
  input: { from: text() },
  access: 'signedIn',
  system: held,
  output: json(),
  run: async ({ input, user }) => {
    const made = await workspaces.create({ owner: user.id, from: input.from })
    const row = await addProject({ owner: user.id, workspace: made.id })
    return { workspace: made.id, project: row.id, address: made.address }
  },
})

export const askTurn = action('askTurn', {
  about: 'Starts a turn of the builder on a workspace, and answers once its run started',
  input: { workspace: text(), project: text(), message: text() },
  access: 'signedIn',
  system: held,
  output: json(),
  run: async ({ input }) =>
    workspaces.turn(input.workspace, 'builder', input.message, { thread: input.project, wait: false }),
})

export const listTurns = action('listTurns', {
  about: 'The turns of a workspace',
  input: { workspace: text() },
  access: 'signedIn',
  system: held,
  output: json(),
  run: async ({ input }) => workspaces.turns(input.workspace),
})

export const undoTurn = action('undoTurn', {
  about: 'Goes back to before a turn',
  input: { workspace: text(), turn: text() },
  access: 'signedIn',
  system: held,
  output: json(),
  run: async ({ input }) => workspaces.undo(input.workspace, input.turn),
})

export const setValue = action('setValue', {
  about: 'Sets a secret of the test side of a workspace, and answers the names that are set',
  input: { workspace: text(), name: text(), value: text() },
  access: 'signedIn',
  system: held,
  output: json(),
  run: async ({ input }) => {
    await workspaces.values(input.workspace, { side: 'test', kind: 'secret', name: input.name, value: input.value })
    return workspaces.values(input.workspace, { side: 'test', kind: 'secret', list: true })
  },
})

export const mailOf = action('mailOf', {
  about: 'The mail that the test side of a workspace would have sent',
  input: { workspace: text() },
  access: 'signedIn',
  system: held,
  output: json(),
  run: async ({ input }) => workspaces.mail(input.workspace),
})

export const publishIt = action('publishIt', {
  about: 'Makes a workspace live',
  input: { workspace: text() },
  access: 'signedIn',
  system: held,
  output: json(),
  run: async ({ input }) => workspaces.publish(input.workspace),
})
