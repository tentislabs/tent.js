import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    log: typeof import('./functions/desk').log
    members: typeof import('./functions/desk').members
    orders: typeof import('./functions/desk').orders
    teams: typeof import('./functions/desk').teams
    users: typeof import('./functions/desk').users
  }
  interface Functions {
    addLogged: typeof import('./functions/desk').addLogged
    copyOrder: typeof import('./functions/desk').copyOrder
  }
  interface Flows {}
  interface Services {}
  interface Models {}
  interface Settings {}
}
