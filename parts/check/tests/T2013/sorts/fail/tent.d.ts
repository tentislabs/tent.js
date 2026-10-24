import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    members: typeof import('./functions/desk').members
    orders: typeof import('./functions/desk').orders
    teams: typeof import('./functions/desk').teams
    users: typeof import('./functions/desk').users
  }
  interface Functions {
    byName: typeof import('./functions/desk').byName
    inCode: typeof import('./functions/desk').inCode
    perName: typeof import('./functions/desk').perName
  }
  interface Flows {}
  interface Services {}
  interface Models {}
  interface Settings {}
}
