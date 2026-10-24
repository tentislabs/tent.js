import { anyone, screen } from 'tentjs/ui'

export const allowApp = screen('allowApp', { for: 'grant', access: 'signedIn', view: () => <span>allowApp</span> })
export const askPerson = screen('askPerson', { for: 'ask', access: 'signedIn', view: () => <span>askPerson</span> })
