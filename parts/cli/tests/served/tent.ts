import { project } from 'tentjs'

// The function of the app says which lines it was handed: a command of this computer hands it neither of its own.
export const served = project('served', {
  title: 'Served',
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000 },
  onRequest: async (request, next) => {
    if (new URL(request.url).pathname === '/seen')
      return Response.json({
        authorization: request.headers.get('authorization'),
        caller: request.headers.get('tent-caller'),
      })
    return next(request)
  },
})
