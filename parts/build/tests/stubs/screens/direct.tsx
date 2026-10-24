import { read, screen } from 'tentjs/ui'
import { slack, sendTasks, tellSales, writer } from '../flows/more'
import { askAdvice, markPaid, openOrders, paidOrders } from '../functions/orders'
import { orders } from '../tables/orders'
import { shop } from '../tent'
import { relayScreen } from './relay'

const handed = () => ({ openOrders, paidOrders, markPaid, askAdvice, tellSales, sendTasks, slack, writer, orders, shop, relayScreen })
const frozen = () => Object.values(handed()).every((one) => Object.isFrozen(one)) && Object.isFrozen(openOrders.input)

export const directScreen = screen('directScreen', {
  path: '/direct',
  access: 'signedIn',
  data: { orders: read(openOrders, { limit: 5 }) },
  view: () => JSON.stringify({ handed: handed(), frozen: frozen() }),
})
