import assert from 'node:assert/strict'
import { test } from 'node:test'
import { notDropped } from './started.ts'
import { scripted, tooled } from './tooled.ts'

// A plain flow that mails what a query read, as the coding agent of the small builder writes one, and states
// nothing of sending: what it calls says that it sends.
const mailFlow = `import { anyone, each, flow, join, mail, query, text } from 'tentjs'
import { notes } from '../tables/users'

export const allTasks = query('allTasks', {
  about: 'Every note',
  access: 'signedIn',
  rows: notes.newest('createdAt').limit(200),
})

export const mailFlow = flow('mailFlow', {
  about: 'Mails the person who presses it every task',
  access: anyone('the letters of a test app'),
  as: 'starter',
  input: { subject: text({ max: 120, default: 'Every task' }) },
  run: async ({ input, user, step, db }) => {
    if (!user) return
    const me = await step('me', () => db.users.get(user.id))
    if (!me) return
    const all = await step('tasks', () => allTasks())
    await step('mail', () =>
      mail.send({
        to: me.email,
        subject: input.subject,
        text: join(
          each(all, (task) => task.body),
          '\\n',
        ),
      }),
    )
  },
})
`

test('[40-17] run of a plain flow that calls mail.send asks the person first, with no sends stated, and a no sends nothing', async (t) => {
  const at = await tooled(t)
  await at.tool('write', { path: 'functions/mailFlow.ts', text: mailFlow })
  const app = await at.workspaces.run(at.made.id)
  assert.equal(app.description.flows.mailFlow?.form, 'plain')
  const model = scripted([{ calls: [{ tool: 'run', with: { name: 'mailFlow', input: {} } }] }, { text: 'Not sent.' }])
  at.app.standIn('writer', model.provider)
  const [row] = Object(
    await at.app.write([{ add: 'projects', values: { owner: at.owner, workspace: at.made.id } }], { as: 'system' }),
  )
  const { run } = notDropped(
    await at.app.start(
      'builder',
      { message: 'Mail a note', thread: String(Object(row).id) },
      { as: at.caller, sources: [{ name: 'project', context: { workspace: at.made.id } }] },
    ),
  )
  let waiting: { name: string } | undefined
  for (let tried = 0; tried < 600 && !waiting; tried++) {
    const read = at.app.runs.read(run)
    assert.ok(
      !read || !['done', 'failed', 'stopped'].includes(read.state),
      `the run ended asking nobody: ${read?.state}`,
    )
    waiting = read?.state === 'waiting' ? read.steps.find((one) => one.state === 'waiting') : undefined
    if (!waiting) await new Promise((done) => setTimeout(done, 50))
  }
  assert.ok(waiting, 'the run waits for the person')
  at.app.runs.refuse(run, waiting.name)
  for (let tried = 0; tried < 600; tried++) {
    if (['done', 'failed', 'stopped'].includes(String(at.app.runs.read(run)?.state))) break
    await new Promise((done) => setTimeout(done, 50))
  }
  assert.deepEqual(await at.workspaces.mail(at.made.id), [])
})
