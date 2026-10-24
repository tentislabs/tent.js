import { screen, read } from 'tentjs/ui'
import { newest } from './functions'

// A code screen: a view of the rows its query reads.
export const home = screen('home', {
  path: '/',
  access: 'anyone',
  title: 'Notes',
  data: { rows: read(newest) },
  view: ({ rows }) => (
    <main>
      <h1>{rows.length} notes</h1>
      {rows.map((one) => (
        <p key={one.id}>{one.what}</p>
      ))}
    </main>
  ),
})
