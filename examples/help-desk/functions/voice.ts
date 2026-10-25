import { action, file, object, text } from 'tentjs'
import { listener } from '../models/models'

// A view is told nothing of what the assistant heard, so the screen has the recording written down first.
export const hearQuestion = action('hearQuestion', {
  about: 'Writes down the question that a recording holds',
  access: 'signedIn',
  input: { audio: file({ maxSize: '10 MB' }) },
  output: object({ text: text() }),
  run: async ({ input }) => {
    const heard = await listener.hear(input.audio, { language: 'en' })
    return { text: heard.text }
  },
})
