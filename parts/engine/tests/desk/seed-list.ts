import { seed } from 'tentjs'
import { tags, users } from './tables.ts'

export default seed([
  users.add({ name: 'Ada', roles: ['staff'], salary: 5000 }),
  users.add({ name: 'Bob', roles: [] }),
  tags.add({ name: 'from the list' }),
])
