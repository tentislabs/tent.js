import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    notes: typeof import('./functions/notes').notes
    users: typeof import('./functions/notes').users
  }
  interface Functions {
    openNotes: typeof import('./functions/notes').openNotes
  }
  interface Flows {}
  interface Services {}
  interface Models {}
  interface Settings {}
}
