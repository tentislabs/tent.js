import { action, anyone, flow } from 'tentjs'

// Each of these throws while a test has switched it on by a save, and works once the save switches it off again.
const actionBreaks = false
const stepBreaks = false

/** Answers the words it is handed, or throws them where the action breaks. */
function checked(words: string): string {
  if (actionBreaks) throw new Error(words)
  return words
}

export const explode = action('explode', {
  access: anyone('a project of the tests, which nobody else reaches'),
  run: async () => checked('The action broke'),
})

export const breaking = flow('breaking', {
  run: async ({ step }) =>
    // One try: a run of a version that a save left is not tried again while the test goes on.
    step(
      'break',
      () => {
        if (stepBreaks) throw new Error('The step broke')
        return 'whole'
      },
      { tries: 1 },
    ),
})
