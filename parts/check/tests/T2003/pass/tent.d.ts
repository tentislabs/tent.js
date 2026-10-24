import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    notes: typeof import('./functions/notes').notes
    tags: typeof import('./functions/notes').tags
  }
  interface Functions {
    addNote: typeof import('./functions/notes').addNote
    openNotes: typeof import('./functions/notes').openNotes
    openTags: typeof import('./functions/notes').openTags
  }
  interface Flows {}
  interface Services {}
  interface Models {}
  interface Settings {}
}
