import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    notes: typeof import('./tables').notes
  }
  interface Functions {
    atOnce: typeof import('./functions').atOnce
    newest: typeof import('./functions').newest
    oneRead: typeof import('./functions').oneRead
    oneWrite: typeof import('./functions').oneWrite
  }
  interface Flows {}
  interface Services {}
  interface Models {}
  interface Settings {}
}
declare module 'tentjs/ui' {
  interface Messages {}
  interface AppState {}
}
