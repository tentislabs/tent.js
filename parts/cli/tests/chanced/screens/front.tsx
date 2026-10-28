import { screen } from 'tentjs/ui'

// A screen that a test on a held clock opens: its page runs on the browser's own timing.
export const front = screen('front', {
  path: '/',
  access: 'anyone',
  view: () => (
    <main>
      <h1>Front</h1>
    </main>
  ),
})
