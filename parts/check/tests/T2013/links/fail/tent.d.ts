import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    members: typeof import('./functions/desk').members
    orders: typeof import('./functions/desk').orders
    shops: typeof import('./functions/desk').shops
    stars: typeof import('./functions/desk').stars
    stock: typeof import('./functions/desk').stock
    teams: typeof import('./functions/desk').teams
    users: typeof import('./functions/desk').users
  }
  interface Functions {}
  interface Flows {}
  interface Services {}
  interface Models {}
  interface Settings {}
}
