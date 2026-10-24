import { action, get, json, number, service, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text(), n: number() }, access: { read: 'signedIn' } })

export const ratesApi = service('ratesApi', {
  url: 'https://rates.example.com',
  calls: { latest: get('/latest', { output: json() }) },
})

export const rates = action('rates', { access: 'signedIn', output: json(), run: async () => ratesApi.latest({}) })
