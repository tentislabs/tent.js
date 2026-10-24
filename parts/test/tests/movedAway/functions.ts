import { action, anyone, text } from 'tentjs'

// A call that takes its time, so that a page moves on while it is under way.
export const slowSave = action('slowSave', {
  access: anyone('every visitor may save'),
  input: { note: text({ optional: true }) },
  run: async () => {
    await new Promise((done) => setTimeout(done, 1500))
    return 'saved'
  },
})
