import { table, text, where } from 'tentjs'

Reflect.set(globalThis, 'crossingLoaded', [...(Reflect.get(globalThis, 'crossingLoaded') ?? []), import.meta.url])

// A helper of the module's own: what calls it is code, which the build cannot read as words.
const reader = (id: string | undefined): string => (id === undefined ? 'anyone' : id.slice(0, 0) || 'anyone')

// A table whose rule of reading is code.
export const notes = table('notes', {
  columns: { what: text(), to: text({ optional: true }) },
  access: {
    read: where((user) => ({ to: reader(user?.id) })),
    add: 'anyone',
  },
})
