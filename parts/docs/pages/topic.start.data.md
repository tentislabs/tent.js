# A table, a query and a change

This page adds one table to the app, then a query that reads it and a change that writes it.

## One table

Every table has `id`, `createdAt` and `updatedAt` by itself. Its `access` says who reads and writes its rows: here the staff alone.

```ts
// tables/orders.ts
import { boolean, number, role, table, text } from 'tentjs'

export const orders = table('orders', {
  columns: { title: text({ min: 1, max: 200 }), total: number({ min: 0 }), done: boolean({ default: false }) },
  access: { read: role('staff'), change: role('staff') },
})
```

## A query and a change

A query reads, a change writes, and each states who may call it.

```ts
// functions/orders.ts
import { change, input, link, query, role } from 'tentjs'
import { orders } from '../tables/orders'

export const openOrders = query('openOrders', {
  about: 'The orders that are not done, newest first',
  access: role('staff'),
  rows: orders.where({ done: false }).newest('createdAt').limit(100),
})

export const getOrder = query('getOrder', {
  about: 'One order',
  access: role('staff'),
  input: { id: link('orders') },
  rows: orders.get(input('id')),
})

export const markDone = change('markDone', {
  about: 'Marks an order as done',
  access: role('staff'),
  input: { order: link('orders') },
  set: orders.change(input('order'), { done: true }),
})
```
