// Tables as a hand writes them: each reads a value that its record holds as the value alone.
import { choice, table, text } from 'tentjs'
import * as shared from '../shared/constants'
import { MAX, STATUSES, noteOptions } from '../shared/constants'

const { WIDE } = { WIDE: 120 }

export const importedConstant = table('importedConstant', {
  columns: { name: text({ max: MAX }), status: choice(STATUSES) },
  access: { read: 'signedIn' },
})

export const starImported = table('starImported', {
  columns: { name: text({ max: shared.MAX }) },
  access: { read: 'signedIn' },
})

export const importedCall = table('importedCall', {
  columns: { name: text(), note: text(noteOptions()) },
  access: { read: 'signedIn' },
})

export const takenApart = table('takenApart', {
  columns: { name: text({ max: WIDE }) },
  access: { read: 'signedIn' },
})
