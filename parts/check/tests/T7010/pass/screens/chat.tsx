import { screen, useAgent } from 'tentjs/ui'
import { helper } from '../functions/ai'

export const chatScreen = screen('chatScreen', {
  path: '/chat',
  access: 'signedIn',
  view: () => {
    const a = useAgent(helper)
    return <span>{a.answer}</span>
  },
})
