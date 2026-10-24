import { allow, project } from 'tentjs'

// Each module of the project leaves a mark on the `globalThis` of the heap that loads it.
Reflect.set(globalThis, 'crossingLoaded', [...(Reflect.get(globalThis, 'crossingLoaded') ?? []), import.meta.url])

// A helper of the module's own: what calls it is code, which the build cannot read as words.
const same = <Value>(value: Value): Value => [value][0] ?? value

export const crossing = project('crossing', {
  title: 'Crossing',
  identify: ({ request }: { request: Request }) => request.headers.get('x-crossing-user') ?? undefined,
  onRequest: (request: Request, next: (request: Request) => Promise<Response>) => next(request),
  uploads: allow((user) => same(user?.id) === 'staff'),
  describeTo: allow((user) => same(user?.id) !== 'nobody at all'),
})
