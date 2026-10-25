import { read, screen } from 'tentjs/ui'
import { TalkOf } from '../components/BotTalk'
import { Frame } from '../components/Frame'
import { botList } from '../functions/bots'

// The list of bots is the sidebar of every screen; here the window opens on the chief, the first tile.
export const botsScreen = screen('botsScreen', {
  path: '/bots',
  title: 'bots',
  access: 'signedIn',
  layout: Frame,
  data: { bots: read(botList) },
  view: ({ bots }) => {
    const chief = bots.find((one) => one.kind === 'chief')
    return (
      <main className="chat">
        <h1 className="hidden-words">Your bots</h1>
        {chief ? <TalkOf bot={chief.id} /> : <p className="empty">Make your first bot with the + at the top.</p>}
      </main>
    )
  },
})
