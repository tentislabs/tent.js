import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    vault: typeof import('./functions/notes').vault
  }
  interface Functions {
    byName: typeof import('./functions/notes').byName
  }
  interface Flows {}
  interface Services {}
  interface Models {}
  interface Settings {}
}
