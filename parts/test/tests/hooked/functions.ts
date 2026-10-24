import {
  anyone,
  change,
  flow,
  incoming,
  json,
  list,
  post,
  route,
  secret,
  service,
  table,
  text,
  verified,
} from 'tentjs'

export const users = table('users', { columns: { roles: list(text()) }, access: { read: 'owner' } })

// What each call coming in handed its flow, one row for each run.
export const events = table('events', { columns: { hook: text(), event: json() }, access: { read: 'anyone' } })

export const note = change('note', {
  access: anyone('the flows of the calls coming in note what they were handed'),
  input: { hook: text(), event: json() },
  run: ({ input, db }) => void db.events.add({ hook: input.hook, event: input.event }),
})

// The flows that the calls coming in start: each notes what it was handed.
export const stripeReceived = flow('stripeReceived', { run: async ({ event, step }) => step('note', () => note({ hook: 'stripeReceived', event })) })
export const formReceived = flow('formReceived', { run: async ({ event, step }) => step('note', () => note({ hook: 'formReceived', event })) })
export const keyedReceived = flow('keyedReceived', { run: async ({ event, step }) => step('note', () => note({ hook: 'keyedReceived', event })) })
export const githubReceived = flow('githubReceived', { run: async ({ event, step }) => step('note', () => note({ hook: 'githubReceived', event })) })
export const buildReceived = flow('buildReceived', { run: async ({ event, step }) => step('note', () => note({ hook: 'buildReceived', event })) })
export const openReceived = flow('openReceived', { run: async ({ event, step }) => step('note', () => note({ hook: 'openReceived', event })) })
export const partnerReceived = flow('partnerReceived', { run: async ({ event, step }) => step('note', () => note({ hook: 'partnerReceived', event })) })
export const bigReceived = flow('bigReceived', { run: async ({ event, step }) => step('note', () => note({ hook: 'bigReceived', event })) })

export const stripe = service('stripe', {
  url: 'https://api.stripe.com',
  webhook: { scheme: 'stripe', secret: secret('STRIPE_HOOK') },
  calls: { ping: post('/ping', { input: {} }) },
})

export const stripeEvents = incoming('stripeEvents', {
  path: '/hooks/stripe',
  verify: stripe.signature,
  then: stripeReceived,
})
export const formEvents = incoming('formEvents', {
  path: '/hooks/forms',
  verify: { scheme: 'standard', secret: secret('FORMS_HOOK') },
  then: formReceived,
})
export const keyedEvents = incoming('keyedEvents', {
  path: '/hooks/keyed',
  verify: { scheme: 'standard', secret: secret('FORMS_KEY') },
  then: keyedReceived,
})
export const githubEvents = incoming('githubEvents', {
  path: '/hooks/github',
  verify: { scheme: 'github', secret: secret('GITHUB_HOOK') },
  then: githubReceived,
})
export const buildEvents = incoming('buildEvents', {
  path: '/hooks/builds',
  verify: {
    scheme: { header: 'X-Signature', encoding: 'hex', prefix: 'sha256=', id: 'X-Delivery' },
    secret: secret('BUILD_HOOK'),
  },
  then: buildReceived,
})
export const openEvents = incoming('openEvents', {
  path: '/hooks/open',
  open: 'a test sends calls that nobody signs',
  then: openReceived,
})
export const partnerEvents = incoming('partnerEvents', {
  path: '/hooks/partner/:shop',
  verify: { scheme: { by: 'partner' }, secret: secret('PARTNER_KEY') },
  then: partnerReceived,
})
export const bigEvents = incoming('bigEvents', {
  path: '/hooks/big',
  open: 'a test sends a large body',
  limits: { size: '3 MB' },
  then: bigReceived,
})

// A route that a provider first asks a question at, on the address of an incoming call.
export const stripeQuestion = route('stripeQuestion', {
  method: 'GET',
  path: '/hooks/stripe',
  access: 'anyone',
  run: async () => new Response('here'),
})

// A route that answers the provider with words of its own, after it read the body.
export const exchange = route('exchange', {
  method: 'POST',
  path: '/exchange',
  access: anyone('a provider posts here'),
  run: async ({ request }) => {
    const read = await request.text()
    try {
      const { id, body } = await verified(request, { scheme: 'github', secret: secret('GITHUB_HOOK') })
      return Response.json({ id, body: new TextDecoder().decode(body), read })
    } catch (error) {
      return Response.json({ code: Object(error).code }, { status: 401 })
    }
  },
})
