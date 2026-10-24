import { screen } from 'tentjs/ui'

export const signIn = screen('signIn', { path: '/sign-in', access: 'anyone', view: () => <span>Sign in</span> })
