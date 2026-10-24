import { action, allow, anyone, change, input, list, query, role, route, sessions, table, text } from 'tentjs'

const open = anyone('a test asks the routes')

export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const notes = table('notes', {
  columns: { words: text() },
  access: { read: 'anyone' },
})

export const signIn = action('signIn', {
  access: open,
  system: 'finds the user that signs in, whom nobody may read yet',
  input: { email: text() },
  run: async ({ input: given, db }) => {
    const user = await db.system.users.where({ email: given.email }).first()
    if (user) sessions.start(user.id)
  },
})

export const staffOnly = action('staffOnly', {
  access: role('staff'),
  output: text(),
  run: async () => 'for the staff alone',
})

export const noteWords = query('noteWords', {
  access: open,
  output: list(text()),
  run: ({ db }) => db.notes.all().map((one) => one.words),
})

// A route that states `GET` alone may be open to anyone with no reason.
export const feed = route('feed', {
  method: 'GET',
  path: '/feed.xml',
  access: 'anyone',
  run: async () => new Response('<rss/>', { headers: { 'content-type': 'application/xml' } }),
})

export const receipt = route('receipt', {
  method: 'GET',
  path: '/orders/:id/receipt',
  access: 'signedIn',
  run: async ({ params, user, about, request }) =>
    Response.json({ id: params.id, user: user?.id, from: about.from, origin: about.origin, method: request.method }),
})

// A route may lie under `/api/`.
export const orderApi = route('orderApi', {
  method: 'GET',
  path: '/api/orders/:id',
  access: open,
  run: async ({ params }) => Response.json({ order: params.id }),
})

// The names of the headers that the code of a route is handed, for a test of what a reader adds to a request.
export const handed = route('handed', {
  method: 'GET',
  path: '/handed',
  access: open,
  run: async ({ request }) => Response.json([...request.headers.keys()].sort()),
})

// How often this route ran on the machine that answers: each machine loads the code of the app for itself.
let ran = 0

export const count = route('count', {
  method: 'GET',
  path: '/count',
  access: open,
  run: async () => new Response(String(++ran)),
})

export const rest = route('rest', {
  method: ['GET', 'PUT'],
  path: '/docs/*',
  access: open,
  run: async ({ params, request }) => new Response(`${request.method} ${params.rest}`),
})

export const report = route('report', {
  method: 'GET',
  path: '/staff/report',
  access: role('staff'),
  run: async () => new Response('the report of the staff'),
})

// A post from another site is refused, but from the one site that the route names.
export const paid = route('paid', {
  method: 'POST',
  path: '/hooks/paid',
  access: open,
  origins: ['https://pay.example'],
  run: async ({ request }) => new Response(`paid: ${await request.text()}`),
})

export const anySite = route('anySite', {
  method: 'POST',
  path: '/hooks/any',
  access: open,
  origins: anyone('its callers are not known when the app is built'),
  run: async () => new Response('taken'),
})

export const own = route('own', {
  method: 'POST',
  path: '/hooks/own',
  access: open,
  run: async () => new Response('taken'),
})

// A rule made with `allow` is handed the user, the request with its values, and a `db`.
export const worded = route('worded', {
  method: 'GET',
  path: '/words/:word',
  access: allow((_user, { request, params }) => request.headers.get('x-word') === params.word),
  run: async ({ params }) => new Response(`the word is ${params.word}`),
})

export const addNote = change('addNote', {
  access: 'nobody',
  input: { words: text() },
  set: notes.add({ words: input('words') }),
})

// Full access: the route reads what its caller may not, and writes by calling a change that nobody may call.
export const keep = route('keep', {
  method: 'POST',
  path: '/notes',
  access: open,
  system: 'a test writes a note with full access',
  run: async ({ request, db, call }) => {
    const users = await db.system.users.all()
    await call(addNote, { words: await request.text() })
    return Response.json({ users: users.length }, { status: 201 })
  },
})

export const enter = route('enter', {
  method: 'POST',
  path: '/enter',
  access: open,
  system: 'finds the user that signs in',
  run: async ({ request, db }) => {
    const user = await db.system.users.where({ email: await request.text() }).first()
    if (!user) return new Response('unknown', { status: 404 })
    sessions.start(user.id)
    return new Response('in')
  },
})

// An answer that is a stream is written to its end, after `run` has answered.
export const counted = route('counted', {
  method: 'GET',
  path: '/counted',
  access: open,
  run: async () => {
    let at = 0
    const lines = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise((done) => setTimeout(done, 5))
        if (at === 20) return controller.close()
        controller.enqueue(new TextEncoder().encode(`line ${at++}\n`))
      },
    })
    return new Response(lines, { headers: { 'content-type': 'text/plain' } })
  },
})

export const broken = route('broken', {
  method: 'GET',
  path: '/fails',
  access: open,
  run: async () => {
    throw new Error('the route of the builder failed')
  },
})

export const slow = route('slow', {
  method: 'GET',
  path: '/slow',
  access: open,
  limits: { time: '100 ms' },
  run: async () => {
    await new Promise((done) => setTimeout(done, 2000))
    return new Response('late')
  },
})

export const small = route('small', {
  method: 'POST',
  path: '/small',
  access: open,
  limits: { size: '1 KB' },
  run: async ({ request }) => new Response(String((await request.text()).length)),
})

export const large = route('large', {
  method: 'POST',
  path: '/large',
  access: open,
  limits: { size: '3 MB' },
  run: async ({ request }) => new Response(String((await request.text()).length)),
})

// Every header that the code of a route is handed, with its value, as a route that sends them on would send them.
export const handedAll = route('handedAll', {
  method: 'GET',
  path: '/handed-all',
  access: open,
  run: async ({ request }) => Response.json(Object.fromEntries(request.headers)),
})
