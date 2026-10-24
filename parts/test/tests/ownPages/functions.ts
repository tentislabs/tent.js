import { query } from 'tentjs'

// A query that fails as it reads, with words that the error page of production must not show.
export const stuckDrawer = query('stuckDrawer', {
  access: 'anyone',
  run: () => {
    throw new Error('the drawer of secrets is stuck')
  },
})
