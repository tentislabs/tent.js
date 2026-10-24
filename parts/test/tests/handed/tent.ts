import { project } from 'tentjs'

// The function of the app says what it was handed, refuses the live connection of one visitor, and would answer
// a command of this computer wrongly if it were ever handed one.
export const handed = project('handed', {
  onRequest: async (request, next) => {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/_t/admin')) return new Response('never', { status: 418 })
    if (url.pathname === '/_t/live' && request.headers.get('x-visitor') === 'unwelcome')
      return new Response('not for you', { status: 403 })
    if (url.pathname === '/who') return Response.json({ seen: request.headers.get('x-seen') })
    const answer = await next(request)
    answer.headers.set('x-app', 'handed')
    return answer
  },
})
