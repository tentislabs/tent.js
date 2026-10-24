import { action, change, fail, input, link, number, object, query, text, workspaces } from 'tentjs'
import { messages } from '../tables/messages'
import { projects } from '../tables/projects'

export const myProjects = query('myProjects', {
  about: 'The projects of the caller, the newest first',
  access: 'signedIn',
  rows: projects.newest('createdAt').with('owner').limit(100),
})

export const projectMessages = query('projectMessages', {
  about: 'The conversation of one project of the caller, in the order it was said',
  access: 'signedIn',
  input: { project: link('projects') },
  rows: messages
    .where({ project: input('project') })
    .oldest('createdAt')
    .limit(500),
})

export const recordProject = change('recordProject', {
  about: 'Keeps the row of a project that was made with its workspace',
  access: 'signedIn',
  input: { workspace: text(), name: text({ min: 1, max: 80 }), address: text() },
  set: projects.add({ workspace: input('workspace'), name: input('name'), address: input('address') }),
})

export const recordLive = change('recordLive', {
  about: 'Keeps the address at which a project went live',
  access: 'signedIn',
  input: { project: link('projects'), live: text() },
  set: projects.change(input('project'), { live: input('live') }),
})

export const newProject = action('newProject', {
  about: 'Makes a project, with a workspace of its own from the blank template',
  access: 'signedIn',
  system: 'it makes a workspace of the caller, which the handle holds to them',
  input: { name: text({ min: 1, max: 80 }) },
  output: object({ id: link('projects') }),
  run: async ({ input, user }) => {
    if (!user) fail('not-signed-in', 'Sign in to make a project.')
    const made = await workspaces.create({ owner: user.id, from: 'blank', name: input.name })
    const row = await recordProject({ workspace: made.id, name: input.name, address: made.address })
    return { id: row.id }
  },
})

export const sendTurn = action('sendTurn', {
  about: 'Hands what the person said to the assistant, which builds on the workspace of the project',
  access: 'signedIn',
  system: 'it starts a turn on the workspace of the caller, which the handle holds to them',
  output: object({ turn: text(), run: text({ optional: true }) }),
  input: {
    project: link('projects'),
    message: text({ min: 1, max: 4000, lines: 'many' }),
    at: object(
      {
        screen: text(),
        place: object({ file: text(), from: number({ whole: true }), to: number({ whole: true }) }),
      },
      { optional: true },
    ),
  },
  run: async ({ input, db }) => {
    const project = await db.projects.get(input.project)
    if (!project) fail('not-found', 'That project is not there.')
    const turn = await workspaces.turn(project.workspace, 'builder', input.message, {
      thread: project.id,
      wait: false,
      at: input.at,
      budget: { tokensOut: 200000 },
    })
    return { turn: turn.id, run: turn.run }
  },
})

export const undoTurn = action('undoTurn', {
  about: 'Goes back to before the last turn of the project, with its files and its test rows',
  access: 'signedIn',
  system: 'it undoes a turn on the workspace of the caller, which the handle holds to them',
  input: { project: link('projects') },
  run: async ({ input, db }) => {
    const project = await db.projects.get(input.project)
    if (!project) fail('not-found', 'That project is not there.')
    const [last] = (await workspaces.turns(project.workspace, { newest: 20 })).filter((turn) => turn.state !== 'undone')
    if (!last) fail('nothing-to-undo', 'There is no turn to undo.')
    const undone = await workspaces.undo(project.workspace, last.id)
    return { turn: last.id, data: undone.data, kept: undone.kept }
  },
})

export const publishProject = action('publishProject', {
  about: 'Makes the app of the project live at its own address',
  access: 'signedIn',
  system: 'it publishes the workspace of the caller, which the handle holds to them',
  output: object({ live: text() }),
  input: { project: link('projects') },
  run: async ({ input, db }) => {
    const project = await db.projects.get(input.project)
    if (!project) fail('not-found', 'That project is not there.')
    await workspaces.publish(project.workspace)
    const shown = await workspaces.get(project.workspace)
    if (!shown?.live) fail('not-live', 'The app did not go live.')
    await recordLive({ project: project.id, live: shown.live.address })
    return { live: shown.live.address }
  },
})
