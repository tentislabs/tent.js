import { project, table, text } from 'tentjs'

export const broken = project('broken', { title: 'Broken' })

const hidden = table('hidden', { columns: { name: text() } })
