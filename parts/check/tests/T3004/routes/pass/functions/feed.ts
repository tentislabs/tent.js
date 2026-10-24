import { flow, list, route, start, table, text } from 'tentjs'

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })

export const notes = table('notes', { columns: { body: text() }, access: { read: 'signedIn' } })

export const tidy = flow('tidy', { run: async ({ step }) => step('work', () => 1) })

// Full access under `system`, the rows of the caller through `db`, and a flow started with no wait.
export const feed = route('feed', {
  method: 'GET',
  path: '/feed',
  access: 'signedIn',
  system: 'every reader of the feed is counted',
  run: async ({ db }) => {
    await db.system.notes.count()
    await tidy()
    return new Response('ok')
  },
})

export const mine = route('mine', {
  method: 'GET',
  path: '/mine',
  access: 'signedIn',
  run: async ({ db }) => {
    const notes = await db.notes.where({ body: 'mine' }).limit(10).all()
    await start(tidy)
    return new Response(String(notes.length))
  },
})
