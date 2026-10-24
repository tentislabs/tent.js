import { allow, flow, text } from 'tentjs'
import { orders } from '../tables/orders'

const told = (code: string) => `${orders.definition} failed with ${code}`

export const ship = flow('ship', {
  input: { order: text() },
  run: async () => ({ done: true }),
  access: allow((user) => told(user?.id ?? '') === 'orders failed with u2'),
  onFail: ({ failure }) => told(failure.code),
  follow: allow((user) => told(user?.id ?? '') === 'orders failed with u1'),
})
