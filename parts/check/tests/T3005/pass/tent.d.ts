import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    audit: typeof import('./functions/notes').audit
  }
  interface Functions {
    addLine: typeof import('./functions/notes').addLine
  }
  interface Flows {}
  interface Services {}
  interface Models {}
  interface Settings {}
}
