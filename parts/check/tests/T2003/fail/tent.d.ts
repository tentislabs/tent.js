import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    tags: typeof import('./functions/notes').tags
  }
  interface Functions {
    openTags: typeof import('./functions/notes').openTags
  }
  interface Flows {}
  interface Services {}
  interface Models {}
  interface Settings {}
}
