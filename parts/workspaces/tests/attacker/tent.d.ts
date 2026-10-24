import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    messages: typeof import('./tables/tables').messages
    projects: typeof import('./tables/tables').projects
    users: typeof import('./tables/tables').users
  }
  interface Functions {
    addProject: typeof import('./functions/projects').addProject
    askTurn: typeof import('./functions/projects').askTurn
    listTurns: typeof import('./functions/projects').listTurns
    mailOf: typeof import('./functions/projects').mailOf
    newProject: typeof import('./functions/projects').newProject
    publishIt: typeof import('./functions/projects').publishIt
    setValue: typeof import('./functions/projects').setValue
    undoTurn: typeof import('./functions/projects').undoTurn
  }
  interface Flows {
    asker: typeof import('./functions/agents').asker
    builder: typeof import('./functions/agents').builder
    coder: typeof import('./functions/agents').coder
    editAsker: typeof import('./functions/agents').editAsker
    filer: typeof import('./functions/agents').filer
    frozen: typeof import('./functions/agents').frozen
    narrow: typeof import('./functions/agents').narrow
    proposer: typeof import('./functions/agents').proposer
    reader: typeof import('./functions/agents').reader
    runAsker: typeof import('./functions/agents').runAsker
    runner: typeof import('./functions/agents').runner
  }
  interface Services {}
  interface Models {
    writer: typeof import('./functions/agents').writer
  }
  interface Settings {}
}
