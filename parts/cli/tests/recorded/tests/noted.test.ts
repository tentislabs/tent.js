import test from 'node:test'
import { testApp } from 'tentjs/test'
import { addNote } from '../functions/note'

test('a note is kept', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  await app.as(maya).call(addNote, { words: 'kept' })
  await app.close()
})
