import { list, query, role, table, text } from 'tentjs'

export const users = table('users', { columns: { email: text({ optional: true }), roles: list(text()) }, access: { read: 'owner' } })

export const revenueByMonth = query('revenueByMonth', {
  about: 'The monthly revenue of the shop',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'revenueByMonth',
})

export const ordersToday = query('ordersToday', {
  about: 'The orders placed today',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'ordersToday',
})

export const ordersThisWeek = query('ordersThisWeek', {
  about: 'The orders placed this week',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'ordersThisWeek',
})

export const bestCustomers = query('bestCustomers', {
  about: 'The customers who spent the most',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'bestCustomers',
})

export const lateDeliveries = query('lateDeliveries', {
  about: 'The deliveries that are late',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'lateDeliveries',
})

export const openTickets = query('openTickets', {
  about: 'The support tickets that are open',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'openTickets',
})

export const stockLevels = query('stockLevels', {
  about: 'How much of each product is in stock',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'stockLevels',
})

export const cheapProducts = query('cheapProducts', {
  about: 'The products under ten',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'cheapProducts',
})

export const newCustomers = query('newCustomers', {
  about: 'The customers who joined this month',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'newCustomers',
})

export const refundsThisMonth = query('refundsThisMonth', {
  about: 'The refunds of this month',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'refundsThisMonth',
})

export const topProducts = query('topProducts', {
  about: 'The products sold most',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'topProducts',
})

export const slowProducts = query('slowProducts', {
  about: 'The products sold least',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'slowProducts',
})

export const taxOfYear = query('taxOfYear', {
  about: 'The tax of the year',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'taxOfYear',
})

export const shippingCosts = query('shippingCosts', {
  about: 'What shipping cost',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'shippingCosts',
})

export const cartsLeft = query('cartsLeft', {
  about: 'The carts that were left',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'cartsLeft',
})

export const reviewsNew = query('reviewsNew', {
  about: 'The reviews written this week',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'reviewsNew',
})

export const returnsOpen = query('returnsOpen', {
  about: 'The returns that wait',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'returnsOpen',
})

export const couponsUsed = query('couponsUsed', {
  about: 'The coupons that were used',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'couponsUsed',
})

export const visitsToday = query('visitsToday', {
  about: 'The visits of today',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'visitsToday',
})

export const suppliersLate = query('suppliersLate', {
  about: 'The suppliers that are late',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'suppliersLate',
})

export const staffRevenue = query('staffRevenue', {
  about: 'The yearly revenue, for the staff',
  access: role('staff'),
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'staffRevenue',
})

export const lastOne = query('lastOne', {
  about: 'The twenty-second function',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'lastOne',
})
