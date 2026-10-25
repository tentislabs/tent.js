import { project } from 'tentjs'

// The table of bots holds the name `bots`, so the project is named apart and the person reads `bots` as its title.
export const botsApp = project('botsApp', {
  title: 'bots',
  signInPath: '/sign-in',
  languages: ['en'],
})
