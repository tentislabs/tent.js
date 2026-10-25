import { each, flow, join, mail } from 'tentjs'
import { allTasks } from './tasks'

export const mailTasks = flow('mailTasks', {
  about: 'Mails the person who presses it every task',
  access: 'signedIn',
  as: 'starter',
  input: {},
  run: async ({ user, step, db }) => {
    if (!user) return
    const me = await step('me', () => db.users.get(user.id))
    if (!me) return
    const all = await step('tasks', () => allTasks())
    await step('mail', () =>
      mail.send({
        to: me.email,
        subject: 'Every task',
        text: join(
          each(all, (task) => task.title),
          '\n',
        ),
      }),
    )
  },
})
