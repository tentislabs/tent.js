// Tables as a hand writes them: each but the last reads a value that its record holds as the value alone.
import { choice, table, text } from 'tentjs' // the words of ours
import { MAX, STATUSES, noteOptions } from '../shared/values'
import * as values from '../shared/values'

const NAME_LENGTH = 40
const { WIDE } = { WIDE: 120 }
const [NARROW] = [12]
const common = { access: { read: 'signedIn' } } as const
function short() {
  return { max: 8 }
}

export const fromHelper = table('fromHelper', {
  columns: { name: text({ max: MAX }) },
  access: { read: 'signedIn' },
})

export const wholeHelper = table('wholeHelper', {
  columns: { name: text({ max: values.MAX }) },
  access: { read: 'signedIn' },
})

export const helperCall = table('helperCall', {
  columns: { name: text(), note: text(noteOptions()) },
  access: { read: 'signedIn' },
})

export const helperList = table('helperList', {
  columns: { status: choice(STATUSES) },
  access: { read: 'signedIn' },
})

export const ownConstant = table('ownConstant', {
  columns: { name: text({ max: NAME_LENGTH }) },
  access: { read: 'signedIn' },
})

export const takenApart = table('takenApart', {
  columns: { name: text({ max: WIDE }), code: text({ max: NARROW }) },
  access: { read: 'signedIn' },
})

export const spread = table('spread', {
  columns: { name: text() },
  ...common,
})

export const ownCall = table('ownCall', {
  columns: { name: text(short()) },
  access: { read: 'signedIn' },
})

export const plainTable = table('plainTable', {
  columns: { name: text({ max: 30 }) },
  access: { read: 'signedIn' },
})
