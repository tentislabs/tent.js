import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    bareTable: typeof import('./tables/bare').bareTable
    fromHelper: typeof import('./tables/reads').fromHelper
    helperCall: typeof import('./tables/reads').helperCall
    helperList: typeof import('./tables/reads').helperList
    ownCall: typeof import('./tables/reads').ownCall
    ownConstant: typeof import('./tables/reads').ownConstant
    plainTable: typeof import('./tables/reads').plainTable
    spread: typeof import('./tables/reads').spread
    takenApart: typeof import('./tables/reads').takenApart
    wholeHelper: typeof import('./tables/reads').wholeHelper
  }
  interface Functions {
    helperLimit: typeof import('./functions/reads').helperLimit
    plainQuery: typeof import('./functions/reads').plainQuery
  }
  interface Flows {}
  interface Services {}
  interface Models {}
  interface Settings {}
}
declare module 'tentjs/ui' {
  interface Messages {}
  interface AppState {
    "mode": "auto" | "light" | "dark"
  }
}
