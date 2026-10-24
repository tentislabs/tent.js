import { allow, query } from 'tentjs'
import { notes } from '../tables/orders'
import { bList } from './b'

export const aList = query('aList', {
  access: allow((user) => {
    let name = bList.definition
    return user?.id === name
  }),
  rows: notes.limit(5),
})
