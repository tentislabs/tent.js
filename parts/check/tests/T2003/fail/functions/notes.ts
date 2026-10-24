import { query, table, text } from 'tentjs'

export const tags = table('tags', { columns: { word: text() }, access: { read: 'signedIn' } })

export const openTags = query('openTags', { access: 'signedIn', rows: tags.limit(20) })
