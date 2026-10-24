import { read, screen } from 'tentjs/ui'
import { busyCount } from './functions'

// A screen whose data is a query that holds the processor.
export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  data: { count: read(busyCount) },
  view: ({ count }) => <h1>{`${count} notes`}</h1>,
})
