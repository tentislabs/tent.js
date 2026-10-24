import { query, text } from 'tentjs'

export const label = query('label', { access: 'anyone', output: text(), run: () => 'Label first' })
