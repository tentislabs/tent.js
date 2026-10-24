import assert from 'node:assert/strict'
import { test } from 'node:test'
import { limitKind, limitNames } from '../limits.ts'
import { measureAt } from '../description.ts'

test('[34-2] the shape of the description marks which numbers are a length of time and which a size, and no other number', () => {
  const marks: [string[], 'time' | 'size' | undefined][] = [
    [['functions', '*', 'limits', 'time'], 'time'],
    [['functions', '*', 'limits', 'memory'], 'size'],
    [['functions', '*', 'limits', 'lost'], undefined],
    [['functions', '*', 'refresh'], 'time'],
    [['functions', '*', 'remember', 'for'], 'time'],
    [['flows', '*', 'limits', 'stepTime'], 'time'],
    [['flows', '*', 'limits', 'result'], 'size'],
    [['flows', '*', 'limits', 'steps'], undefined],
    [['flows', '*', 'tries', 'wait'], 'time'],
    [['flows', '*', 'tries', 'max'], undefined],
    [['flows', '*', 'agent', 'limits', 'ask'], 'time'],
    [['services', '*', 'limits', 'size'], 'size'],
    [['services', '*', 'limits', 'perMinute'], undefined],
    [['models', '*', 'job', 'every'], 'time'],
    [['incoming', '*', 'limits', 'size'], 'size'],
    [['screens', '*', 'cache'], 'time'],
    [['project', 'workers', '*', 'idleAfter'], 'time'],
    [['project', 'workers', '*', 'atOnce'], undefined],
    [['project', 'backups', 'every'], 'time'],
    [['tables', '*', 'columns'], undefined],
  ]
  for (const [path, mark] of marks) assert.equal(measureAt(...path), mark, path.join('.'))
  // Each limit of a project is marked as the limits of the engine have it.
  for (const name of limitNames) {
    const kind = limitKind(name)
    assert.equal(measureAt('project', 'limits', name), kind === 'count' ? undefined : kind, name)
  }
})
