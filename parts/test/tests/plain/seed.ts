import { seed } from 'tentjs'
import { orders } from './tent'

export default seed([orders.add({ name: 'Ann', total: 5 })])
