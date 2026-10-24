import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    audit: typeof import('./functions/notes').audit
    notes: typeof import('./functions/notes').notes
  }
  interface Functions {
    openNotes: typeof import('./functions/notes').openNotes
  }
  interface Flows {}
  interface Services {}
  interface Models {}
  interface Settings {}
}
