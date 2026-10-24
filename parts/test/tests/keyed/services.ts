import { get, number, object, secret, service, text } from 'tentjs'

export const github = service('github', {
  url: 'https://api.github.com',
  auth: {
    oauth: {
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      clientId: secret('GITHUB_ID'),
      clientSecret: secret('GITHUB_SECRET'),
      scopes: ['repo'],
    },
  },
  calls: { listIssues: get('/issues', { input: {} }) },
})

// A service that a test app fakes: it reaches nothing outside.
export const weather = service('weather', {
  url: 'https://api.weather.example',
  auth: { bearer: secret('WEATHER_KEY') },
  calls: { today: get('/today', { input: { city: text() }, output: object({ temp: number() }) }) },
})
