import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    users: typeof import('./tables/users').users
  }
  interface Functions {}
  interface Flows {}
  interface Services {}
  interface Models {}
  interface Settings {}
}
