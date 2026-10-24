import { action, allow, number, route } from 'tentjs'

const big = (total: unknown) => Number(total) > 100

export const refund = action('refund', {
  input: { total: number() },
  access: allow((user, input) => user !== undefined && big(input.total)),
  follow: allow((user, input) => user === undefined && big(input.total)),
  background: true,
  run: async ({ input }) => input.total,
})

export const feed = route('feed', {
  method: 'GET',
  path: '/feed.xml',
  access: allow((user) => big(user?.id.length)),
  run: () => new Response('<feed />'),
})
