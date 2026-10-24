import { screen } from 'tentjs/ui'
import { Button } from '../components/Button'

export const oneLineScreen = screen('oneLineScreen', { path: '/one-line', access: 'anyone', view: () => <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><span>One line</span><span style={{ color: '#5f6672' }}>All of it</span></div> })

export const manyLinesScreen = screen(
  'manyLinesScreen',
  {
    path: '/many-lines',
    access: 'signedIn',
    title: 'Many lines',
    view: () => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span>
          Many
          lines
        </span>
        <Button>
          Mark it paid
        </Button>
      </div>
    ),
  },
)
