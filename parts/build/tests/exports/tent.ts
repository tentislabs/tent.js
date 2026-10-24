import { allow, project } from 'tentjs'

const staff = new Set(['u1'])

export const shop = project('shop', {
  title: 'Shop',
  identify: ({ request }: { request: Request }) => request.headers.get('x-user') ?? undefined,
  onRequest: (request, next) => next(request),
  uploads: allow((user) => staff.has(user?.id ?? '')),
  describeTo: allow((user) => !staff.has(user?.id ?? '')),
  build: { vite: (config: object) => ({ ...config, marked: true }) },
})
