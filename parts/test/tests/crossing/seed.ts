import { seed } from 'tentjs'

Reflect.set(globalThis, 'crossingLoaded', [...(Reflect.get(globalThis, 'crossingLoaded') ?? []), import.meta.url])

export default seed(({ db }) => {
  db.notes.add({ what: 'seeded', to: 'anyone' })
})
