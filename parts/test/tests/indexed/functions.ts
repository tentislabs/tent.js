import { input, query, table, text } from 'tentjs'

export const products = table('products', {
  columns: { slug: text(), name: text(), summary: text() },
  access: { read: 'anyone' },
})

export const productSlugs = query('productSlugs', { access: 'anyone', rows: products.oldest('slug') })

export const productBySlug = query('productBySlug', {
  access: 'anyone',
  input: { slug: text() },
  rows: products.where({ slug: input('slug') }).first(),
})
