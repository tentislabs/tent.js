import { anyone, screen } from 'tentjs/ui'

export const allowApp = screen('allowApp', { for: 'grant', access: 'signedIn', view: () => <span>allowApp</span> })
export const allowAgain = screen('allowAgain', { for: 'grant', access: 'signedIn', view: () => <span>allowAgain</span> })
export const askPerson = screen('askPerson', { for: 'ask', access: anyone('everyone may answer'), view: () => <span>askPerson</span> })
