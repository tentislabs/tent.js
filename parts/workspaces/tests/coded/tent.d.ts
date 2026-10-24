import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    notes: typeof import('./tables/users').notes
    users: typeof import('./tables/users').users
  }
  interface Functions {
    addNote: typeof import('./functions/users').addNote
    addUser: typeof import('./functions/users').addUser
    allNotes: typeof import('./functions/users').allNotes
    makeKey: typeof import('./functions/keys').makeKey
    whoAmI: typeof import('./functions/users').whoAmI
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
