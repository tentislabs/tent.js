import { fieldsOf } from '../description.ts'
import { limitDefaults } from '../limits.ts'
import { isMarked } from '../mark.ts'
import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import { valueWords } from '../valueWords.ts'
import { stepNamesOf, storedBody } from './body.ts'
import { keptAt } from './kept.ts'
import { nameAt, nameIf, namesAt } from './named.ts'
import type { Told } from './shared.ts'
import { bytes, code, known, ms, optionsOf, plainOf, report, required, setField, wasOf } from './shared.ts'
import { shownAs } from './shown.ts'
import { heldValue, ruleOf, typeOf, typesOf } from './type.ts'

/** The options of `flow`. */
const flowOptions = [
  'run',
  'on',
  'key',
  'stopOn',
  'pace',
  'sealed',
  'about',
  'input',
  'output',
  'limits',
  'tries',
  'together',
  'moveRuns',
  'onFail',
  'onStop',
  'as',
  'danger',
  'offer',
  'access',
  'system',
  'sends',
  'follow',
  'countBy',
  'plain',
  'was',
]

/** The options of `agent`. */
const agentOptions = [
  'model',
  'instructions',
  'tools',
  'limits',
  'about',
  'access',
  'offer',
  'on',
  'memory',
  'voice',
  'trust',
  'knows',
  'together',
  'key',
  'pace',
  'onStop',
  'words',
  'driver',
  'policy',
  'reasoning',
  'tell',
  'sequence',
  'output',
  'guards',
  'handsOver',
  'questions',
  'score',
  'countBy',
  'was',
]

const schedules = [
  /^\d+(?:\.\d+)? (?:minutes?|hours?)$/,
  /^(?:day|monday|tuesday|wednesday|thursday|friday|saturday|sunday) at (?:[01]\d|2[0-3]):[0-5]\d$/,
  /^month on (?:[1-9]|1\d|2[0-8]) at (?:[01]\d|2[0-3]):[0-5]\d$/,
]

/** The triggers of `on` as they are stored: one trigger or a list, always as a list. */
function triggersOf(told: Told, written: unknown): Stored[] {
  if (written === undefined) return []
  return (Array.isArray(written) ? written : [written]).flatMap((one) => {
    if (!isMarked(one)) {
      report(
        told,
        'T1014',
        '`on` holds what is no trigger.',
        'Write every(...), cron(...), event(...), or a trigger of a table.',
      )
      return []
    }
    const every = one.every
    if (typeof every === 'string' && !schedules.some((form) => form.test(every)))
      report(
        told,
        'T1011',
        `the schedule ${shownAs(one.every)} does not read.`,
        "Write '15 minutes', 'day at 09:00', 'monday at 09:00' or 'month on 1 at 09:00'.",
      )
    if (one.where !== undefined) heldValue(told, 'the `where` of a trigger', one.where, ['given'])
    // Of an event that is declared, the trigger keeps the name: the type of its data is the type checker's.
    const { data: _, ...stored } = optionsOf(plainOf(one))
    return [typeof one.event === 'string' ? stored : optionsOf(plainOf(one))]
  })
}

/**
 * The events of `stopOn` as they are stored: always a list, each with the key it stops by as code. An event with no
 * key, and what is no event, is T1014.
 */
function stopsOf(told: Told, written: unknown): Stored[] {
  if (written === undefined) return []
  return (Array.isArray(written) ? written : [written]).flatMap((one, at) => {
    if (!isMarked(one) || typeof one.event !== 'string' || typeof one.key !== 'function') {
      report(
        told,
        'T1014',
        '`stopOn` holds what is no event with a key.',
        "Write event('order.cancelled', { key: ({ data }) => data.order }).",
      )
      return []
    }
    return [{ event: one.event, key: code(`${told.name}_stopOn_${at}`) }]
  })
}

/**
 * `pace` of a flow as it is stored: each length of time in milliseconds, and `order` as code. A part that is no
 * part of `pace` is T1003.
 */
function paceOf(told: Told, written: unknown): Stored | undefined {
  if (written === undefined) return undefined
  const o = optionsOf(written)
  known(told, 'pace', o, ['debounce', 'perMinute', 'drop', 'batch', 'order', 'turns'])
  const windowOf = (part: string): Stored | undefined => {
    const stated = optionsOf(o[part])
    if (o[part] === undefined) return undefined
    return optionsOf(plainOf({ max: stated.max, per: ms(told, `pace.${part}.per`, stated.per) }))
  }
  const batch = optionsOf(o.batch)
  const stored: Stored = {}
  setField(stored, 'debounce', ms(told, 'pace.debounce', o.debounce))
  setField(stored, 'perMinute', o.perMinute)
  setField(stored, 'drop', windowOf('drop'))
  if (o.batch !== undefined) stored.batch = plainOf({ max: batch.max, wait: ms(told, 'pace.batch.wait', batch.wait) })
  if (typeof o.order === 'function') stored.order = code(`${told.name}_pace_order`)
  setField(stored, 'turns', o.turns)
  return stored
}

/** How often a step is tried, as it is stored: a number, or its record with the first wait in milliseconds. */
export function triesOf(told: Told, written: unknown, unless: number): unknown {
  if (!isStored(written)) return written === unless ? undefined : written
  return plainOf({
    ...written,
    wait: ms(told, 'tries.wait', written.wait),
    first: ms(told, 'tries.first', written.first),
  })
}

/** The limits of a flow, of an agent and of a service as they are stored: each time in milliseconds and each size in bytes. */
export function limitsOf(
  told: Told,
  written: unknown,
  times: readonly string[],
  sizes: readonly string[],
  unless: Stored = {},
): Stored {
  const stored: Stored = {}
  for (const [name, value] of Object.entries(optionsOf(written))) {
    const made = times.includes(name)
      ? ms(told, `limits.${name}`, value)
      : sizes.includes(name)
        ? bytes(told, `limits.${name}`, value)
        : plainOf(value)
    setField(stored, name, made, keptAt(unless, name))
  }
  return stored
}

/** Keeps the `key` of a flow or an agent, an arrow, as code in the record it is stored as. */
function keyIn(told: Told, o: Stored, stored: Stored): void {
  if (typeof o.key === 'function') stored.key = code(`${told.name}_key`)
  else if (o.key !== undefined)
    report(
      told,
      'T1014',
      '`key` is no arrow.',
      'Write an arrow over the input and the event: `key: ({ input }) => input.order`.',
    )
}

/**
 * Takes the options of `flow` as they were written. Answers the record of the flow as it is stored: plain with the
 * body that the build read and its step names, and code with its export.
 */
export function flowOf(told: Told, o: Stored): Stored {
  known(told, 'flow', o, flowOptions)
  required(told, 'flow', o, ['run'])
  const stored: Stored = { form: 'code' }
  setField(stored, 'on', triggersOf(told, o.on))
  keyIn(told, o, stored)
  setField(stored, 'stopOn', stopsOf(told, o.stopOn))
  setField(stored, 'pace', paceOf(told, o.pace))
  setField(stored, 'sealed', o.sealed, false)
  setField(stored, 'about', o.about)
  const input = typesOf(told, 'input', o.input)
  setField(stored, 'input', input)
  if (input && 'run' in input && (o.access !== undefined || o.offer !== undefined))
    report(
      told,
      'T1009',
      'the input field `run` is reserved for a flow that is offered.',
      'Give the field another name.',
    )
  if (o.output !== undefined) stored.output = typeOf(told, 'output', o.output)
  if (o.sends === false) stored.sends = false
  setField(stored, 'offer', o.offer)
  setField(stored, 'access', ruleOf(told, 'access', o.access, `${told.name}_access`))
  setField(stored, 'system', o.system)
  const read = told.loaded.bodies?.run
  const failed = told.loaded.bodies?.onFail
  if (Array.isArray(read)) Object.assign(stored, { body: storedBody(told, read), stepNames: stepNamesOf(read) })
  else stored.export = told.name
  if (o.onFail !== undefined)
    stored.onFail = Array.isArray(failed) ? storedBody(told, failed) : code(`${told.name}_onFail`)
  const stopping = told.loaded.bodies?.onStop
  if (o.onStop !== undefined)
    stored.onStop = Array.isArray(stopping) ? storedBody(told, stopping) : code(`${told.name}_onStop`)
  const readAll = [failed, stopping].every((one, at) => [o.onFail, o.onStop][at] === undefined || Array.isArray(one))
  // `key`, a key of `stopOn` and `order` of `pace` are kept as code: a flow that states one is code.
  const arrowsOfCode = o.key !== undefined || o.stopOn !== undefined || optionsOf(o.pace).order !== undefined
  if (Array.isArray(read) && readAll && !arrowsOfCode) stored.form = 'plain'
  setField(
    stored,
    'limits',
    limitsOf(told, o.limits, ['time', 'wait', 'pass', 'stepTime'], ['result'], limitDefaults.flow),
  )
  setField(stored, 'tries', triesOf(told, o.tries, 4))
  const together = optionsOf(plainOf(o.together))
  // What a run is about is its key: the runs are counted apart by it, and by nothing else.
  if (o.together !== undefined) known(told, 'together', together, ['max', 'then', 'group'])
  if (together.max === 10) delete together.max
  if (together.then === 'wait') delete together.then
  setField(stored, 'together', together)
  setField(stored, 'moveRuns', o.moveRuns, 'never')
  setField(stored, 'as', o.as, 'system')
  setField(stored, 'danger', o.danger)
  setField(stored, 'follow', ruleOf(told, 'follow', o.follow, `${told.name}_follow`))
  setField(stored, 'countBy', o.countBy)
  setField(stored, 'plain', o.plain, false)
  setField(stored, 'was', wasOf(o.was))
  return stored
}

/** One guard as it is stored: the name of a definition, a judge with its model by name, or one of the engine's own. */
function guardOf(told: Told, handed: unknown, place: string): Stored | string | undefined {
  if (isMarked(handed) && (handed.guard === 'noOtherPeople' || handed.guard === 'noPersonal'))
    return { ours: handed.guard }
  const judge = isStored(handed) ? optionsOf(Reflect.get(handed, 'judge')) : undefined
  if (judge && typeof judge.model === 'string' && typeof judge.rule === 'string')
    return { judge: optionsOf(plainOf(judge)) }
  return nameAt(told, 'guards', handed, place)
}

/** The guards of an agent as they are stored: those that run on what comes in, on what goes out, and the words of a refusal. */
function guardsOf(told: Told, written: unknown): Stored {
  const guards = optionsOf(written)
  known(told, 'guards', guards, ['in', 'out', 'refused'])
  const stored: Stored = {}
  for (const side of ['in', 'out'] as const) {
    const listed = guards[side]
    if (listed === undefined) continue
    if (!Array.isArray(listed)) {
      report(
        told,
        'T1014',
        `\`guards.${side}\` is no list of guards.`,
        'Write a list of guards: `[tone, noOtherPeople]`.',
      )
      continue
    }
    const made = listed.flatMap((one, at) => guardOf(told, one, `guards.${side}.${at}`) ?? [])
    if (made.length) stored[side] = made
  }
  setField(stored, 'refused', guards.refused)
  return stored
}

/** How the finished runs of an agent are scored, as it is stored: the share of them, and the judge with its model by name. */
function scoreOf(told: Told, written: unknown): Stored {
  const score = optionsOf(written)
  known(told, 'score', score, ['share', 'with'])
  required(told, 'score', score, ['share', 'with'])
  if (typeof score.share !== 'number' || score.share < 0 || score.share > 1)
    report(
      told,
      'T1014',
      '`score.share` is no number from 0 to 1.',
      'Give the share of the runs that are scored, as 0.05.',
    )
  const judge = optionsOf(Reflect.get(Object(score.with), 'judge'))
  if (typeof judge.model !== 'string' || typeof judge.rule !== 'string')
    report(told, 'T1014', '`score.with` is no judge.', "Write `judge(model, 'the rule')`, or `judge.fromTools(model)`.")
  return { share: plainOf(score.share), with: optionsOf(plainOf(judge)) }
}

/** The type words that a sequence of an agent may hold, as the shape of a `fill`. */
const sequenceTypes = ['text', 'number', 'boolean', 'date', 'day', 'choice', 'list', 'object']

const agentDefaults: Stored = {
  time: 600_000,
  ask: 604_800_000,
  result: 1_048_576,
  toolCalls: 100,
  toolsAtOnce: 8,
  pass: 5000,
}

/**
 * Takes the options of `agent` as they were written. Answers the record of a flow whose form is plain, with
 * the record `agent` and neither a body nor a module, and `outside` worked out: the tools that come from a
 * service which states `mcp`.
 */
export function agentOf(told: Told, o: Stored): Stored {
  known(told, 'agent', o, agentOptions)
  required(told, 'agent', o, ['model', 'instructions', 'tools'])
  const stored: Stored = { form: 'plain' }
  setField(stored, 'on', triggersOf(told, o.on))
  setField(stored, 'about', o.about)
  setField(stored, 'offer', o.offer)
  setField(stored, 'together', plainOf(o.together))
  setField(stored, 'countBy', o.countBy)
  // A run of an agent is a run of a flow: its key, its pace and its `onStop` are kept as a flow keeps them.
  keyIn(told, o, stored)
  setField(stored, 'pace', paceOf(told, o.pace))
  if (o.onStop !== undefined) stored.onStop = code(`${told.name}_onStop`)
  const record: Stored = {}
  setField(record, 'model', nameIf(told, 'model', o.model))
  setField(record, 'instructions', o.instructions)
  setField(record, 'access', ruleOf(told, 'access', o.access, `${told.name}_access`))
  const listed = Array.isArray(o.tools) ? o.tools : []
  const named = listed.flatMap((one, at) => {
    const entry = optionsOf(one)
    if (!(isStored(one) && 'tool' in entry)) return nameAt(told, 'tools', one, `tools.${at}`) ?? []
    const tool = nameAt(told, 'tools', entry.tool, `tools.${at}.tool`)
    return tool === undefined ? [] : optionsOf(plainOf({ ...entry, tool }))
  })
  // A list of tools with an entry that names none is left out whole.
  const tools = named.length === listed.length ? named : []
  setField(record, 'tools', tools)
  const toolName = (tool: unknown) => (isStored(tool) ? String(tool.tool) : String(tool))
  // A tool is told to a model under its own name, or under `name` of its entry, which is the way out.
  const toldAsList = o.tell === 'list' || o.sequence === true
  const reserved = [
    ...(toldAsList ? ['call', 'sequence'] : []),
    ...(o.output !== undefined ? ['answer'] : []),
    ...(o.handsOver !== undefined ? ['handOver'] : []),
    ...(o.questions === true ? ['question'] : []),
    ...(o.sequence === true ? ['all', 'fill', 'fail', ...Object.keys(valueWords), ...sequenceTypes] : []),
  ]
  for (const tool of tools) {
    const toldAs = isStored(tool) && typeof tool.name === 'string' ? tool.name : toolName(tool)
    if (reserved.includes(toldAs))
      report(
        told,
        'T1009',
        `the tool \`${toldAs}\` is told under a name that is reserved for what the agent itself gives a model.`,
        'Give its entry of `tools` another name with `name`.',
      )
  }
  const service = (tool: unknown) => toolName(tool).split('.')[0]
  setField(
    record,
    'outside',
    tools
      .map(toolName)
      .filter(
        (tool) => Boolean(told.all.get(service(tool))?.options.mcp) && told.all.get(service(tool))?.kind === 'service',
      ),
  )
  const trust = namesAt(told, 'trust', o.trust)
  // A tool of the provider's own that the model names may be trusted too.
  const hosted: unknown = Reflect.get(Object(told.all.get(String(record.model))?.options), 'hosted')
  const ownTools = Array.isArray(hosted) ? hosted.map(String) : []
  for (const name of trust ?? [])
    if (!tools.map(toolName).includes(name) && !tools.map(toolName).includes(service(name)) && !ownTools.includes(name))
      report(
        told,
        'T1014',
        `\`trust\` names ${name}, which is no tool of the agent.`,
        'Name a tool as it stands in `tools`.',
      )
  setField(record, 'trust', trust)
  // What the engine tells the model of a run, in the order it was written: the moment, and the facts of a table; left out when empty.
  const knows = Array.isArray(o.knows) ? o.knows : o.knows === undefined ? [] : [o.knows]
  const toldModel = knows.flatMap((word, at): (string | Stored)[] => {
    if (word === 'caller' || word === 'time') return [word]
    const facts = isStored(word) && !isMarked(word) ? Reflect.get(word, 'facts') : undefined
    const table = facts === undefined ? undefined : nameAt(told, 'knows', facts, `knows.${at}.facts`)
    if (table !== undefined) return [{ facts: table }]
    report(
      told,
      'T1014',
      `\`knows\` names ${JSON.stringify(word)}, which is nothing the engine tells a model.`,
      "Name 'caller', 'time', or `{ facts: <table> }`.",
    )
    return []
  })
  setField(record, 'knows', toldModel.length ? toldModel : undefined)
  setField(record, 'limits', limitsOf(told, o.limits, ['time', 'ask', 'pass'], ['result'], agentDefaults))
  known(told, 'policy', optionsOf(o.policy), fieldsOf('flows', '*', 'agent', 'policy'))
  setField(record, 'policy', plainOf(o.policy))
  const memory = optionsOf(o.memory)
  if (o.memory !== undefined) {
    known(told, 'memory', memory, fieldsOf('flows', '*', 'agent', 'memory'))
    const kept: Stored = {}
    setField(kept, 'in', nameIf(told, 'memory.in', memory.in))
    setField(kept, 'thread', memory.thread, 'thread')
    setField(kept, 'of', memory.of)
    setField(kept, 'keep', memory.keep, 10)
    setField(kept, 'after', memory.after, memory.keep ?? 10)
    const shrink = memory.shrink
    // The nearest older turns of a thread are a record of their count, and no definition.
    const nearest = isStored(shrink) && !isMarked(shrink) ? Reflect.get(shrink, 'nearest') : undefined
    const by = nearest === undefined ? nameIf(told, 'memory.shrink', shrink) : undefined
    setField(
      kept,
      'shrink',
      nearest !== undefined
        ? { nearest: plainOf(nearest) }
        : typeof shrink === 'string' || by === undefined
          ? by
          : { [told.all.get(by)?.kind === 'flow' ? 'flow' : 'function']: by },
      'all',
    )
    setField(kept, 'model', nameIf(told, 'memory.model', memory.model))
    setField(kept, 'recall', memory.recall)
    record.memory = kept
  }
  known(told, 'words', optionsOf(o.words), fieldsOf('flows', '*', 'agent', 'words'))
  setField(record, 'words', plainOf(o.words))
  setField(record, 'driver', o.driver)
  setField(record, 'reasoning', plainOf(o.reasoning))
  setField(record, 'tell', o.tell, 'tools')
  setField(record, 'sequence', o.sequence, false)
  if (o.output !== undefined) record.output = typeOf(told, 'output', o.output)
  if (o.guards !== undefined) record.guards = guardsOf(told, o.guards)
  const handsOver = namesAt(told, 'handsOver', o.handsOver)
  for (const name of handsOver ?? [])
    if (told.all.get(name) && told.all.get(name)?.kind !== 'agent')
      report(
        told,
        'T1014',
        `\`handsOver\` names ${name}, which is no agent.`,
        'Name the agents a conversation may be handed over to.',
      )
  setField(record, 'handsOver', handsOver)
  setField(record, 'questions', o.questions, false)
  if (o.score !== undefined) record.score = scoreOf(told, o.score)
  const voice = optionsOf(o.voice)
  if (o.voice !== undefined)
    record.voice = plainOf({
      ...voice,
      hear: nameIf(told, 'voice.hear', voice.hear),
      speak: nameIf(told, 'voice.speak', voice.speak),
    })
  stored.agent = record
  setField(stored, 'was', wasOf(o.was))
  return stored
}
