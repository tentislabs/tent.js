import { action, anyone, change, input, list, log, number, object, query, secrets, settings, text } from 'tentjs'
import { vault } from './tables.ts'

const open = anyone('a test tries the secrets and the settings')

// --- secrets ---

// What a secret reads as wherever it is written out with no `reveal()`.
export const asText = action('asText', {
  access: open,
  output: list(text()),
  run: async () => [String(secrets.PAY_KEY), `${secrets.PAY_KEY}`, JSON.stringify({ key: secrets.PAY_KEY })],
})

// The code opens the secret, and answers only how long it is.
export const lengthOfKey = action('lengthOfKey', {
  access: open,
  input: { name: text({ default: 'PAY_KEY' }) },
  output: number(),
  run: async ({ input: given }) => secrets[given.name].reveal().length,
})

// The code opens the secret and then writes it into the log and into the message of an error: as it is, with
// percent signs, and in base64.
export const leaks = action('leaks', {
  access: open,
  input: { name: text({ default: 'PAY_KEY' }) },
  run: async ({ input: given }) => {
    const value = secrets[given.name].reveal()
    log.info(`the key is ${value}`, { key: value, percent: encodeURIComponent(value) })
    log.warn(`in base64 it is ${Buffer.from(value).toString('base64')}`)
    throw new Error(`the service refused the key ${value}`)
  },
})

export const revealInQuery = query('revealInQuery', {
  access: open,
  output: number(),
  run: () => secrets.PAY_KEY.reveal().length,
})

export const setKey = action('setKey', {
  access: open,
  system: 'a test sets a secret from the app itself',
  input: { name: text(), value: text() },
  run: async ({ input: given }) => secrets.set(given.name, given.value),
})

export const dropKey = action('dropKey', {
  access: open,
  system: 'a test removes a secret from the app itself',
  input: { name: text() },
  run: async ({ input: given }) => secrets.remove(given.name),
})

// `set` is full access: a function that states no `system` may not use it.
export const setKeyAsAnyone = action('setKeyAsAnyone', {
  access: open,
  input: { name: text(), value: text() },
  run: async ({ input: given }) => secrets.set(given.name, given.value),
})

// --- settings ---

export const shown = query('shown', {
  access: open,
  output: object({ shopName: text(), maxItems: number(), owner: text({ optional: true }), tags: list(text()) }),
  run: () => ({
    shopName: settings.shopName,
    maxItems: settings.maxItems,
    owner: settings.owner,
    tags: settings.tags,
  }),
})

// --- a sealed column ---

export const keep = change('keep', {
  access: open,
  input: { title: text(), note: text(), pin: number({ optional: true }) },
  set: vault.add({ title: input('title'), note: input('note'), pin: input('pin') }),
})

export const kept = query('kept', { access: open, rows: vault.oldest('title') })
