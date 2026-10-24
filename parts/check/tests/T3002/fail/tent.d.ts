import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    notes: typeof import('./functions/notes').notes
  }
  interface Functions {
    addNote: typeof import('./functions/notes').addNote
    openNotes: typeof import('./functions/notes').openNotes
  }
  interface Flows {}
  interface Services {}
  interface Models {}
  interface Settings {}
}
