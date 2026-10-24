import { allow, query } from 'tentjs'
import { notes } from '../tables/orders'
import { aList } from './a'

export const bList = query('bList', {
  access: allow((user) => {
    let name = aList.definition
    return user?.id === name
  }),
  rows: notes.limit(5),
})
