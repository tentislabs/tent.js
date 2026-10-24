import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    orders: typeof import('./functions/notes').orders
    users: typeof import('./functions/notes').users
  }
  interface Functions {
    markPaid: typeof import('./functions/notes').markPaid
  }
  interface Flows {}
  interface Services {}
  interface Models {}
  interface Settings {}
}
