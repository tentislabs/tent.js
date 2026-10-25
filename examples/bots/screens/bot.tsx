import { boolean, read, screen } from 'tentjs/ui'
import { TalkOf } from '../components/BotTalk'
import { Details } from '../components/Details'
import { Frame } from '../components/Frame'
import { getBot } from '../functions/bots'

export const botScreen = screen('botScreen', {
  path: '/bots/:id',
  title: 'bots',
  access: 'signedIn',
  layout: Frame,
  state: { details: { type: boolean(), in: 'address' } },
  data: ({ params }) => ({ bot: read(getBot, { id: params.id }, { needed: true }) }),
  view: ({ bot, state }) => (
    <main className="chat">
      <h1 className="hidden-words">{bot.name}</h1>
      <TalkOf bot={bot.id} details={state.details} />
      {state.details && <Details bot={bot.id} />}
    </main>
  ),
})
