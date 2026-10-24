import { project } from 'tentjs'

// Every request of the app is handed to `onRequest` first: it answers some itself, hands some on under another
// address, and adds a header to whatever the door answered.
export const shop = project('shop', {
  title: 'Shop',
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000, screensPerMinute: 100000 },
  onRequest: async (request, next, about) => {
    const url = new URL(request.url)
    if (url.pathname === '/closed') return new Response('closed for today', { status: 503 })
    if (url.pathname === '/old') return Response.redirect(new URL('/feed.xml', request.url), 307)
    if (url.pathname === '/alias') return next(new Request(new URL('/feed.xml', request.url), request))
    if (url.pathname === '/alias-staff')
      return next(
        new Request(new URL('/_t/call/staffOnly', request.url), {
          method: 'POST',
          // The cookies of the visitor go on with the request, so that its caller is who asked.
          headers: { 'content-type': 'application/json', cookie: request.headers.get('cookie') ?? '' },
          body: '{"input":{}}',
        }),
      )
    if (url.pathname === '/broken') throw new Error('the code of the builder failed')
    if (url.pathname === '/about') return Response.json({ ...about, forged: request.headers.get('x-tent-from') })
    const answer = await next(request)
    answer.headers.set('x-frame', 'shop')
    // Added once for each machine that calls this function for the request: so a test sees that one did.
    answer.headers.append('x-seen', 'once')
    return answer
  },
})
