import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    drafts: typeof import('./functions/desk').drafts
    lines: typeof import('./functions/desk').lines
    members: typeof import('./functions/desk').members
    notes: typeof import('./functions/desk').notes
    orders: typeof import('./functions/desk').orders
    tasks: typeof import('./functions/desk').tasks
    teams: typeof import('./functions/desk').teams
    users: typeof import('./functions/desk').users
  }
  interface Functions {}
  interface Flows {}
  interface Services {}
  interface Models {}
  interface Settings {}
}
