import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    users: typeof import('./functions/reach').users
  }
  interface Functions {
    reach: typeof import('./functions/reach').reach
  }
  interface Flows {}
  interface Services {}
  interface Models {}
  interface Settings {}
}
