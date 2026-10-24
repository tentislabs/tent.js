import { screen } from 'tentjs/ui'

const shout = (words: string): string => words.toUpperCase()

// A view that calls a function of the file is code: nothing writes it anew.
export const codeScreen = screen('codeScreen', {
  path: '/code',
  access: 'anyone',
  view: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span>{shout('code')}</span>
    </div>
  ),
})

export const firstScreen = screen('firstScreen', { path: '/first', access: 'anyone', view: () => <div><span>First</span></div> }),
  secondScreen = screen('secondScreen', { path: '/second', access: 'anyone', view: () => <div><span>Second</span></div> })
