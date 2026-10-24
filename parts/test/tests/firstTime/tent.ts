import { project, secrets, text } from 'tentjs'
import { welcome } from './functions'

// The login of a company: its proxy writes the email of a person into a header, with a word that only the proxy
// and the app know. A person who comes for the first time is given their row. One setting is shown to every page.
export const shop = project('shop', {
  title: 'Shop',
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000, screensPerMinute: 100000 },
  settings: {
    shopName: { type: text({ default: 'The shop' }), public: true },
    ownerNote: { type: text({ default: 'for the owner alone' }) },
  },
  identify: async ({ request, db, call }) => {
    const word = request.headers.get('x-proxy-word')
    if (word === null || word !== secrets.PROXY_WORD.reveal()) return undefined
    const email = request.headers.get('x-company-user')
    if (email === null) return undefined
    const known = await db.users.where({ email }).first()
    return known?.id ?? String(await call(welcome, { email }))
  },
})
