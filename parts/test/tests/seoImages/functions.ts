import { change, input, query, table, text } from 'tentjs'

export const products = table('products', {
  columns: { title: text(), color: text() },
  access: { read: 'anyone' },
})

export const allProducts = query('allProducts', { access: 'anyone', rows: products.oldest('title') })

export const productById = query('productById', {
  access: 'anyone',
  input: { id: text() },
  rows: products.where({ id: input('id') }).first(),
})

export const paint = change('paint', {
  access: 'anyone',
  input: { product: text(), color: text() },
  set: products.change(input('product'), { color: input('color') }),
})
