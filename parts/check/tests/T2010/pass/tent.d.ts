import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    articles: typeof import('./functions/notes').articles
  }
  interface Functions {
    near: typeof import('./functions/notes').near
  }
  interface Flows {}
  interface Services {}
  interface Models {
    embedder: typeof import('./functions/notes').embedder
    other: typeof import('./functions/notes').other
  }
  interface Settings {}
}
