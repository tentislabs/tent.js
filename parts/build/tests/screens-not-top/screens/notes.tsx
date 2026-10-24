import { component, screen } from 'tentjs/ui'

// A `const` that is not exported, and a definition that is made inside a function.
const hidden = screen('hidden', { path: '/hidden', access: 'anyone', view: () => 'Hidden' })

export const makeTag = () => component('Tag', { view: () => 'A tag' })

export const notesList = screen('notesScreen', { path: '/notes', access: 'anyone', view: () => `Notes of ${hidden.definition}` })
