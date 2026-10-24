/** The declared types of the input of a start of an agent: what a screen, a `Form` and the engine read alike. */
export const startTypes = {
  message: { kind: 'text', lines: 'many', optional: true },
  thread: { kind: 'text', optional: true },
  files: { kind: 'list', of: { kind: 'file' }, optional: true },
  audio: { kind: 'file', optional: true },
  speak: { kind: 'boolean', optional: true },
}

const text = { kind: 'text' }
const optionalText = { kind: 'text', optional: true }
const optionalNumber = { kind: 'number', optional: true }

/** The name of a member of an agent. */
export type MemberName = 'working' | 'approve' | 'refuse' | 'stop' | 'rate'

/** The input of each member of an agent, and the kind each is. `data` of `approve` is the answer to a question. */
export const memberTypes: Record<MemberName, { kind: 'query' | 'action'; input: Record<string, object> }> = {
  working: { kind: 'query', input: { thread: optionalText, run: optionalText } },
  approve: {
    kind: 'action',
    input: { run: text, step: text, repeat: optionalNumber, n: optionalNumber, data: { kind: 'json', optional: true } },
  },
  refuse: { kind: 'action', input: { run: text, step: text, repeat: optionalNumber, n: optionalNumber } },
  stop: { kind: 'action', input: { run: optionalText, thread: optionalText } },
  rate: { kind: 'action', input: { run: text, score: { kind: 'number' }, note: optionalText } },
}

/** The names of the members of an agent, in a fixed order. */
export const memberNames: readonly MemberName[] = ['working', 'approve', 'refuse', 'stop', 'rate']
