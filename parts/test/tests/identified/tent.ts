import { project } from 'tentjs'
import { counted } from './asked'

// The login of a company, as its proxy writes it into a header: the email of a person, and three words that try
// what the engine does with the others. The counts of a minute are set far above the tests, but for the one of
// `identify` itself, which a test runs into.
export const shop = project('shop', {
  title: 'Shop',
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000, screensPerMinute: 100000 },
  identify: async ({ request, db }) => {
    counted()
    const named = request.headers.get('company-user')
    if (named === null) return undefined
    if (named === 'broken') throw new Error('the login of the company did not answer')
    if (named === 'ghost') return 'no-row-has-this-id'
    // It waits, as a login that is asked over a network does, and reads the users with full access.
    await new Promise((done) => setImmediate(done))
    const user = await db.users.where({ email: named }).first()
    return user?.id
  },
})
