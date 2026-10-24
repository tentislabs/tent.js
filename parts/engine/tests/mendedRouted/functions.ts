import { action, number, route, runs } from 'tentjs'

// A route that states system, and so has full access, which the handle runs asks.
export const allRuns = route('allRuns', {
  method: 'GET',
  path: '/runs',
  access: 'anyone',
  system: 'counts the runs for a test',
  run: async () => new Response(String((await runs.find({})).length)),
})

// An action that is under way for a long time, as one is when its app is closed.
export const waitsLong = action('waitsLong', {
  access: 'anyone',
  output: number(),
  run: async () => {
    await new Promise((done) => setTimeout(done, 20_000))
    return 1
  },
})
