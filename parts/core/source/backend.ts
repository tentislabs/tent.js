import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import type { Doc } from './doc.ts'
import { listDoc, recordDoc } from './doc.ts'
import { freeNames } from './free.ts'
import type { Form } from './plain.ts'
import { entryDocs, fieldsDoc, measuredDoc, plainDoc, triesForm } from './plain.ts'
import { filterDoc, planDoc, triggerDoc, writeDoc } from './plan.ts'
import { givenDoc } from './statements.ts'
import { isName, keyText, quoted } from './texts.ts'
import { typesDoc } from './type.ts'
import type { Writing } from './writing.ts'
import { naming, noText, ours } from './writing.ts'
import { marked } from './marked.ts'

/**
 * A stored body as the arrow it was read from: its one parameter taken apart into the names of what it is handed
 * that the body reads, `async` in front where `waits` says so, and what it gives.
 */
export function runDoc(w: Writing, body: unknown, waits: boolean): Doc {
  const statements = Array.isArray(body) ? body : []
  const names = freeNames(statements)
  const params = names.length ? `({ ${names.join(', ')} })` : '()'
  return [`${waits ? 'async ' : ''}${params} => `, givenDoc(w, statements)]
}

/** One entry or a list of them, as an option that takes either is written. */
const oneOrList = (docs: Doc[]): Doc => (docs.length === 1 ? docs[0] : listDoc(docs))

/** A name of a definition as it is handed on: the definition where the name is one, and the name as text where it holds a dot. */
const handed = (w: Writing, name: unknown): Doc =>
  isName(String(name)) ? naming(w, String(name)) : quoted(String(name))

/**
 * How long a row of a table lasts: a length of time alone, or with the moment it counts from, which is its last
 * write where it is left out, and the rows it names as a filter.
 */
const lastsForm: Form = (w, value) =>
  isStored(value)
    ? fieldsDoc(w, value, {
        for: marked('tables', '*', 'lasts', 'for'),
        by: (w, by) => (by === 'updatedAt' ? undefined : plainDoc(w, by)),
        where: (w, where) => filterDoc(w, where),
      })
    : measuredDoc(w, marked('tables', '*', 'lasts'), value)

/** How the runs of a flow are paced, its lengths of time in words. */
const paceForm: Form = {
  debounce: marked('flows', '*', 'pace', 'debounce'),
  perMinute: 'plain',
  drop: { max: 'plain', per: marked('flows', '*', 'pace', 'drop', 'per') },
  batch: { max: 'plain', wait: marked('flows', '*', 'pace', 'batch', 'wait') },
  turns: 'plain',
}

/** The options of a table, in the order they are written. */
export function tableEntries(w: Writing, table: Stored): Doc[] {
  return entryDocs(w, table, {
    columns: (w, columns) => typesDoc(w, columns, true),
    owner: 'plain',
    access: { read: 'rule', add: 'rule', change: 'rule', remove: 'rule' },
    search: 'plain',
    indexes: 'plain',
    unique: 'plain',
    keepHistory: 'plain',
    removed: 'plain',
    reaches: 'never',
    tenant: 'plain',
    shows: 'plain',
    kept: 'plain',
    lasts: lastsForm,
    plain: 'plain',
    was: 'was',
  })
}

const never: { [field: string]: Form } = {
  kind: 'never',
  form: 'never',
  module: 'never',
  export: 'never',
  stepNames: 'never',
  tiedTo: 'never',
  reads: 'never',
  touches: 'never',
  reaches: 'never',
}

/** The forms of the limits of a flow, or of the agent of one, as the shape marks each. */
const limitsOf = (part: string, names: string[], inside?: string): Form =>
  Object.fromEntries(names.map((name) => [name, marked(...[part, '*', ...(inside ? [inside] : []), 'limits', name])]))

const workLimits: Form = Object.fromEntries(
  ['time', 'try', 'reserve', 'lost', 'perDay', 'atLimit', 'runKept', 'memory', 'load'].map((name) => [
    name,
    marked('functions', '*', 'limits', name),
  ]),
)

/** The plans that heavy work reads, each under its name. */
const plansByName: Form = (w, rows) =>
  recordDoc(
    Object.entries(isStored(rows) ? rows : {}).map(([name, plan]) => [
      `${keyText(name)}: `,
      isStored(plan) ? planDoc(w, plan) : '{}',
    ]),
  )

/** The options of a query, a change or an action, in the order they are written. Throws T0013 for one that is code. */
export function functionEntries(w: Writing, name: string, fn: Stored): Doc[] {
  if (fn.form !== 'plain' || isStored(fn.python)) throw noText(`The function \`${name}\``)
  const waits = fn.kind === 'action'
  const how: { [field: string]: Form } = {
    plan: 'never',
    writes: 'never',
    body: 'never',
    access: 'rule',
  }
  const stored: Stored = { ...fn }
  // The one of `rows`, `set` and `run` that the function is written with stands right after its rule.
  if (isStored(fn.plan)) {
    stored.rows = fn.plan
    how.rows = (w, plan) => (isStored(plan) ? planDoc(w, plan) : undefined)
  } else if (Array.isArray(fn.writes)) {
    stored.set = fn.writes
    how.set = (w, writes) =>
      oneOrList((Array.isArray(writes) ? writes : []).filter(isStored).map((one) => writeDoc(w, one)))
  } else {
    stored.run = fn.body
    how.run = (w, body) => runDoc(w, body, waits)
  }
  return entryDocs(w, stored, {
    ...how,
    about: 'plain',
    input: 'types',
    output: 'type',
    live: 'plain',
    refresh: marked('functions', '*', 'refresh'),
    heavy: 'plain',
    danger: 'plain',
    // What a plain action sends is worked out from its body, and stands only where its author said that it sends nothing.
    sends: 'plain',
    offer: 'plain',
    deprecated: 'plain',
    system: 'plain',
    background: 'plain',
    worker: 'plain',
    batch: { max: 'plain', wait: marked('functions', '*', 'batch', 'wait') },
    remember: (w, value) =>
      isStored(value) ? fieldsDoc(w, value, { for: marked('functions', '*', 'remember', 'for') }) : plainDoc(w, value),
    ...(isStored(fn.plan) ? {} : { rows: plansByName }),
    uses: 'plain',
    changes: 'plain',
    callerGone: 'plain',
    follow: 'rule',
    countBy: 'plain',
    everywhere: 'plain',
    limits: workLimits,
    plain: 'plain',
    was: 'was',
    ...never,
  })
}

/** The triggers of a flow or of an agent: one, or a list of them. What an incoming call added is never written. */
const triggers: Form = (w, on) => {
  const docs: Doc[] = []
  for (const one of (Array.isArray(on) ? on : []).filter(isStored)) {
    const doc = triggerDoc(w, one)
    if (doc !== undefined) docs.push(doc)
  }
  return docs.length ? oneOrList(docs) : undefined
}

/**
 * The options of a flow, in the order they are written. Throws T0013 for one whose `run` or `onFail` is code, and
 * for an agent whose `key`, `onStop` or `order` of `pace` is code.
 */
export function flowEntries(w: Writing, name: string, flow: Stored): Doc[] {
  if (isStored(flow.agent)) {
    const pace = isStored(flow.pace) ? flow.pace : {}
    if (flow.key !== undefined || flow.onStop !== undefined || pace.order !== undefined)
      throw noText(`The agent \`${name}\``)
    return agentEntries(w, flow)
  }
  if (flow.form !== 'plain') throw noText(`The flow \`${name}\``)
  return entryDocs(
    w,
    { run: flow.body, ...flow },
    {
      run: (w, body) => runDoc(w, body, true),
      on: triggers,
      about: 'plain',
      input: 'types',
      output: 'type',
      limits: limitsOf('flows', ['steps', 'time', 'result', 'wait', 'pass', 'stepTime']),
      tries: triesForm,
      together: 'plain',
      moveRuns: 'plain',
      onFail: (w, body) => runDoc(w, body, true),
      as: 'plain',
      danger: 'plain',
      offer: 'plain',
      access: 'rule',
      system: 'plain',
      // What a plain flow sends is worked out from its body.
      sends: 'never',
      follow: 'rule',
      countBy: 'plain',
      pace: paceForm,
      plain: 'plain',
      was: 'was',
      body: 'never',
      ...never,
    },
  )
}

/** One tool of an agent: its name, or its record with the name as `tool`. */
const toolDoc = (w: Writing, tool: unknown): Doc =>
  isStored(tool) ? fieldsDoc(w, tool, { tool: (w, name) => handed(w, name) }) : handed(w, tool)

/** A judge, as it is written: `judge(model, rule)`, or one of the judges of our own by its member. */
function judgeDoc(w: Writing, judged: unknown): Doc {
  const one = isStored(judged) ? judged : {}
  const options = [
    ...(typeof one.pass === 'number' && one.pass !== 0.7 ? [`pass: ${one.pass}`] : []),
    ...(typeof one.words === 'string' ? [`words: ${quoted(one.words)}`] : []),
  ]
  const more = options.length ? [`{ ${options.join(', ')} }`] : []
  const model = naming(w, String(one.model))
  if (one.kind === 'fromTools' || one.kind === 'onTask')
    return [ours(w, 'judge'), `.${one.kind}(`, [model, ...more].join(', '), ')']
  return [ours(w, 'judge'), '(', [model, quoted(String(one.rule)), ...more].join(', '), ')']
}

/** The guards of one side: each definition by its name, a judge as its word, and a guard of the engine's own by its word. */
const guardsDoc: Form = (w, guards) =>
  listDoc(
    (Array.isArray(guards) ? guards : []).map((one) =>
      isStored(one) && typeof one.ours === 'string'
        ? ours(w, one.ours)
        : isStored(one) && isStored(one.judge)
          ? judgeDoc(w, one.judge)
          : handed(w, one),
    ),
  )

/** What `knows` names: each word as it is, and the table of facts by its name. */
const knowsDoc: Form = (w, knows) =>
  listDoc(
    (Array.isArray(knows) ? knows : []).map((one) =>
      isStored(one) && typeof one.facts === 'string'
        ? recordDoc([['facts: ', handed(w, one.facts)]])
        : plainDoc(w, one),
    ),
  )

/** The options of an agent, in the order they are written: those of its flow record, and those inside `agent`. */
function agentEntries(w: Writing, flow: Stored): Doc[] {
  const { agent, ...rest } = flow
  const inner = isStored(agent) ? agent : {}
  return entryDocs(
    w,
    { ...inner, ...rest },
    {
      model: 'name',
      instructions: 'plain',
      tools: (w, tools) => listDoc((Array.isArray(tools) ? tools : []).map((one) => toolDoc(w, one))),
      limits: limitsOf('flows', ['steps', 'perRun', 'time', 'ask', 'result', 'pass'], 'agent'),
      about: 'plain',
      access: 'rule',
      offer: 'plain',
      on: triggers,
      memory: {
        in: 'name',
        thread: 'plain',
        of: 'plain',
        keep: 'plain',
        after: 'plain',
        shrink: (w, shrink) =>
          isStored(shrink) ? naming(w, String(shrink.function ?? shrink.flow)) : plainDoc(w, shrink),
        model: 'name',
        recall: 'plain',
      },
      voice: { hear: 'name', speak: 'name' },
      trust: 'plain',
      knows: knowsDoc,
      together: 'plain',
      words: 'plain',
      driver: 'plain',
      policy: 'plain',
      reasoning: 'plain',
      tell: 'plain',
      sequence: 'plain',
      output: 'type',
      guards: (w, guards) =>
        isStored(guards)
          ? fieldsDoc(w, guards, { in: guardsDoc, out: guardsDoc, refused: 'plain' })
          : plainDoc(w, guards),
      handsOver: (w, names) => listDoc((Array.isArray(names) ? names : []).map((one) => handed(w, one))),
      questions: 'plain',
      score: (w, score) =>
        isStored(score) && isStored(score.with)
          ? fieldsDoc(w, score, { share: 'plain', with: (w, judged) => judgeDoc(w, judged) })
          : plainDoc(w, score),
      countBy: 'plain',
      pace: paceForm,
      was: 'was',
      outside: 'never',
      ...never,
    },
  )
}

/** The options of an incoming call, in the order they are written. */
export function incomingEntries(w: Writing, incoming: Stored): Doc[] {
  return entryDocs(w, incoming, {
    path: 'plain',
    then: 'name',
    // The signature of a service is handed on as a member of the service, and a scheme with a secret as its record.
    verify: (w, verify) =>
      isStored(verify) && typeof verify.service === 'string'
        ? `${naming(w, verify.service)}.signature`
        : plainDoc(w, verify),
    open: 'plain',
    limits: { size: marked('incoming', '*', 'limits', 'size') },
    was: 'was',
  })
}
