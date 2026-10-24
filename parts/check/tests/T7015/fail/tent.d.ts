import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    users: typeof import('./functions/signs').users
  }
  interface Functions {
    named: typeof import('./functions/signs').named
  }
  interface Flows {}
  interface Services {}
  interface Models {}
  interface Settings {}
}
