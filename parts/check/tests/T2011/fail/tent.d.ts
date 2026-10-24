import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    vault: typeof import('./functions/notes').vault
  }
  interface Functions {
    byKey: typeof import('./functions/notes').byKey
  }
  interface Flows {}
  interface Services {}
  interface Models {}
  interface Settings {}
}
