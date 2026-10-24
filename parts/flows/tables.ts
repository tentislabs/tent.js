import type { ColumnType, TableLayout } from '../data/index.ts'

const text: ColumnType = { kind: 'text' }
const maybeText: ColumnType = { kind: 'text', optional: true }
const data: ColumnType = { kind: 'json', optional: true }
const moment: ColumnType = { kind: 'date', optional: true }
const whole: ColumnType = { kind: 'number', whole: true, optional: true }

/** `_t_runs`: one row for each run, with an index by which the runner finds its next wake, and one for the runs of a key. */
export const runsTable: TableLayout = {
  name: '_t_runs',
  columns: {
    id: text,
    flow: text,
    kind: text,
    version: text,
    state: text,
    input: data,
    event: data,
    startedBy: data,
    as: text,
    parent: maybeText,
    parentStep: data,
    top: text,
    leave: maybeText,
    thread: maybeText,
    given: data,
    wakeAt: moment,
    answer: data,
    error: data,
    used: data,
    workedMs: whole,
    createdAt: moment,
    endedAt: moment,
    key: maybeText,
    from: maybeText,
    trace: maybeText,
  },
  key: ['id'],
  indexes: [
    ['state', 'wakeAt'],
    ['flow', 'key'],
  ],
  unique: [],
  search: [],
}

/** `_t_steps`: one row for each step that has begun, by its run, its name and its repeat number. */
export const stepsTable: TableLayout = {
  name: '_t_steps',
  columns: {
    run: text,
    name: text,
    repeat: { kind: 'number', whole: true },
    state: text,
    result: data,
    size: whole,
    error: data,
    show: data,
    ask: data,
    agreed: data,
    waitsFor: data,
    wakeAt: moment,
    tries: whole,
    startedAt: moment,
    endedAt: moment,
    out: data,
    away: data,
    progress: data,
    many: data,
  },
  key: ['run', 'name', 'repeat'],
  indexes: [],
  unique: [],
  search: [],
}

/** `_t_schedule`: the next time each timed trigger fires, by its flow and its place in the flow's `on`. */
export const scheduleTable: TableLayout = {
  name: '_t_schedule',
  columns: { flow: text, trigger: text, nextAt: moment },
  key: ['flow', 'trigger'],
  indexes: [],
  unique: [],
  search: [],
}
