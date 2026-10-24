import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    users: typeof import('./functions/notes').users
  }
  interface Functions {
    staff: typeof import('./functions/notes').staff
  }
  interface Flows {}
  interface Services {}
  interface Models {}
  interface Settings {}
}
