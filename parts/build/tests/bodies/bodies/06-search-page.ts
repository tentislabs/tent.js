import { query } from 'tentjs'
import { shop } from '../app/shop.ts'
import intro from './intro.txt'

export const searchPage = query('searchPage', {
  access: 'everyone',
  run: ({ input, db }) => {
    const hits = db.orders.search(input.text).sort('total').pick(['id', 'total']).all()
    const page = db.orders.where({ status: 'open' }).after(input.cursor).limit(2).all()
    const close = db.orders.near('meaning', input.like, { within: 0.5 }).limit(1).all()
    const byStatus = db.orders.group(['status'], { total: { sum: 'total' } }).all()
    return {
      intro,
      letters: intro.length,
      first: hits?.[0],
      picked: input.rows?.[input.at]?.id,
      plain: input.marks['late'],
      late: input.marks['?late'],
      maybe: input.marks?.['late'],
      maybeLate: input.marks?.['?late'],
      most: shop.options.limits.orders.most,
      title: shop.options.title,
      second: shop.options.languages[1],
      closed: shop.options.closed,
      page,
      close,
      byStatus,
    }
  },
})
