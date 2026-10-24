import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    notes: typeof import('./functions/notes').notes
  }
  interface Functions {
    openNotes: typeof import('./functions/notes').openNotes
  }
  interface Flows {
    helper: typeof import('./flows/tidy').helper
    tidy: typeof import('./flows/tidy').tidy
  }
  interface Services {}
  interface Models {
    writer: typeof import('./flows/tidy').writer
  }
  interface Settings {}
}
