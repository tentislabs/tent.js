import { seed } from 'tentjs'
import { users } from './tables/users'

// Two people, each of whom builds an app of their own.
export default seed([users.add({ email: 'ada@builder.example' }), users.add({ email: 'bo@builder.example' })])
