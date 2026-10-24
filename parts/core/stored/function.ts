import { helperWordOf } from '../definition.ts'
import { limitDefaults } from '../limits.ts'
import { isMarked } from '../mark.ts'
import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import { bodyOf, storedBody } from './body.ts'
import { writesHeld } from './from.ts'
import { namesAt } from './named.ts'
import type { Told } from './shared.ts'
import { bytes, known, ms, optionsOf, plainOf, report, required, setField, throughLinks, wasOf } from './shared.ts'
import { tablesIn } from './table.ts'
import { heldValue, planRecord, ruleOf, typeOf, typesOf } from './type.ts'

const heavy = ['background', 'worker', 'batch', 'remember', 'rows', 'uses', 'changes', 'callerGone', 'follow']
const common = ['access', 'about', 'input', 'output', 'offer', 'deprecated', 'system', 'countBy', 'was']

/** The options of each word that makes a function. */
const functionOptions: Record<string, string[]> = {
  query: [...common, 'rows', 'run', 'live', 'refresh', 'heavy', 'reads', 'plain'],
  change: [...common, 'set', 'run', 'danger', 'touches', 'everywhere', 'plain'],
  action: [...common, ...heavy, 'run', 'danger', 'sends', 'limits', 'plain'],
  python: [...common, ...heavy, 'file', 'packages', 'files', 'lock', 'limits', 'gpu', 'atOnce', 'sends', 'danger'],
}

/** The tables that a plan names: its own, those its `with` follows a link to, and those of the plans inside it. */
function tablesOfPlan(told: Told, plan: Stored): string[] {
  const found = tablesIn(plan)
  for (const column of Array.isArray(plan.with) ? plan.with : [])
    for (const reached of throughLinks(told, String(plan.from), String(column).split('.'))) found.add(reached)
  return [...found]
}

/** The writes of `set` as they are stored: one write or a list, always as a list. */
function writesOf(told: Told, written: unknown): Stored[] {
  const writes = (Array.isArray(written) ? written : [written]).filter((one): one is Stored => {
    const fits = isMarked(one) && ('add' in one || 'change' in one || 'remove' in one)
    if (!fits)
      report(
        told,
        'T1014',
        '`set` holds what is no write.',
        'Write orders.add(...), orders.change(...) or orders.remove(...).',
      )
    return fits
  })
  heldValue(told, '`set`', writes, [])
  writesHeld(told, '`set`', writes)
  return writes.map((one) => ({ ...one }))
}

/** The limits of work as they are stored: times in milliseconds and sizes in bytes. */
function workLimits(told: Told, written: unknown): Stored {
  const o = optionsOf(written)
  const stored: Stored = {}
  const time = (name: string) => ms(told, `limits.${name}`, o[name])
  setField(stored, 'time', time('time'))
  // One try may take as long as the caller waits, and sets aside the time of the try, unless they say otherwise.
  setField(stored, 'try', time('try'), stored.time)
  setField(stored, 'reserve', time('reserve'), stored.try ?? stored.time)
  setField(stored, 'runKept', time('runKept'), limitDefaults.action.runKept)
  setField(stored, 'load', time('load'))
  setField(stored, 'memory', bytes(told, 'limits.memory', o.memory))
  setField(stored, 'lost', o.lost, limitDefaults.action.lost)
  for (const name of ['perDay', 'atLimit']) setField(stored, name, plainOf(o[name]))
  return stored
}

/** The options of heavy work as they are stored, each as it was written, with its times in milliseconds. */
function heavyOf(told: Told, o: Stored, stored: Stored): void {
  setField(stored, 'background', o.background, false)
  setField(stored, 'worker', o.worker)
  const batch = optionsOf(o.batch)
  setField(
    stored,
    'batch',
    o.batch === undefined ? undefined : plainOf({ ...batch, wait: ms(told, 'batch.wait', batch.wait) }),
  )
  const remember = optionsOf(o.remember)
  setField(
    stored,
    'remember',
    isStored(o.remember) ? plainOf({ ...remember, for: ms(told, 'remember.for', remember.for) }) : o.remember,
  )
  setField(
    stored,
    'rows',
    Object.fromEntries(
      Object.entries(optionsOf(o.rows)).map(([name, plan]) => [name, planRecord(told, `rows.${name}`, plan)]),
    ),
  )
  setField(stored, 'uses', namesAt(told, 'uses', o.uses))
  if (o.changes === false) stored.changes = false
  setField(stored, 'callerGone', o.callerGone, 'goOn')
  setField(stored, 'follow', ruleOf(told, 'follow', o.follow, `${told.name}_follow`))
}

/**
 * Takes the kind of a function and its options as they were written. Answers the record of the function as it is
 * stored: plain with its plan, its writes or the body that the build read, and code with its export. Reports a
 * function written in two forms (T1007), a required option that is left out (T1008) and a reserved name (T1009).
 */
export function functionOf(told: Told, kind: 'query' | 'change' | 'action', o: Stored): Stored {
  const python = helperWordOf(told.loaded.value) === 'python'
  const word = python ? 'python' : kind
  known(told, word, o, functionOptions[word])
  required(told, word, o, python ? ['file', 'input', 'output', 'access'] : ['access'])
  const values = kind === 'query' ? 'rows' : 'set'
  const read = told.loaded.bodies?.run
  const stored: Stored = { kind, form: 'code' }
  if (!python && kind !== 'action' && o[values] !== undefined && o.run !== undefined)
    report(
      told,
      'T1007',
      `it is written in two forms at once, with \`${values}\` and with \`run\`.`,
      'Keep one of the two.',
    )
  else if (!python && o.run === undefined && (kind === 'action' || o[values] === undefined))
    report(
      told,
      'T1008',
      kind === 'action' ? 'it states no `run`, which is required.' : `it states neither \`${values}\` nor \`run\`.`,
      kind === 'action' ? 'State `run`.' : `State \`${values}\` or \`run\`.`,
    )
  setField(stored, 'about', o.about)
  const input = typesOf(told, 'input', o.input)
  setField(stored, 'input', input)
  if (input && 'run' in input && (o.worker !== undefined || (o.background !== undefined && o.background !== false)))
    report(
      told,
      'T1009',
      'the input field `run` is reserved for an action that states `worker` or `background`.',
      'Give the field another name.',
    )
  if (o.output !== undefined) stored.output = typeOf(told, 'output', o.output)
  setField(stored, 'access', ruleOf(told, 'access', o.access, `${told.name}_access`))
  if (!python && kind === 'query' && o.rows !== undefined && o.run === undefined) {
    const plan = planRecord(told, 'rows', o.rows)
    if (plan) Object.assign(stored, { form: 'plain', plan, reads: tablesOfPlan(told, plan) })
  } else if (!python && kind === 'change' && o.set !== undefined && o.run === undefined) {
    const writes = writesOf(told, o.set)
    const touches = writes.map((one) => String(one.add ?? one.change ?? one.remove))
    Object.assign(stored, { form: 'plain', writes, touches: [...new Set(touches)] })
    setField(stored, 'reads', [...tablesIn(writes)])
  } else if (!python && Array.isArray(read))
    Object.assign(stored, { form: 'plain', body: storedBody(told, read) }, bodyOf(told, read))
  else stored.export = told.name
  // An action that imports a file starts a run of the import, so its app keeps runs.
  if (
    kind === 'action' &&
    typeof o.run === 'function' &&
    /\bimportFile\b/.test(Function.prototype.toString.call(o.run))
  )
    stored.imports = true
  if (stored.form === 'code' || (kind === 'query' ? o.reads : o.touches) !== undefined) {
    setField(stored, 'reads', namesAt(told, 'reads', o.reads) ?? stored.reads)
    setField(stored, 'touches', namesAt(told, 'touches', o.touches) ?? stored.touches)
  }
  const access = optionsOf(stored.access)
  if (access.rule === 'allow' && access.test !== undefined)
    setField(stored, 'reaches', bodyOf(told, [{ return: access.test }]).reads)
  setField(stored, 'everywhere', o.everywhere, false)
  setField(stored, 'live', o.live, true)
  setField(stored, 'refresh', ms(told, 'refresh', o.refresh))
  setField(stored, 'heavy', o.heavy, false)
  if (kind === 'action') heavyOf(told, o, stored)
  setField(stored, 'danger', o.danger, 'none')
  if (o.sends === false) stored.sends = false
  setField(stored, 'offer', o.offer)
  setField(stored, 'deprecated', o.deprecated)
  setField(stored, 'system', o.system)
  setField(stored, 'countBy', o.countBy)
  setField(stored, 'limits', workLimits(told, o.limits))
  if (python) {
    const record: Stored = {}
    for (const name of ['file', 'packages', 'files', 'lock', 'atOnce']) setField(record, name, o[name])
    setField(record, 'gpu', o.gpu, false)
    stored.python = record
  }
  setField(stored, 'plain', o.plain, false)
  setField(stored, 'was', wasOf(o.was))
  return stored
}
