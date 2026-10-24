import assert from 'node:assert/strict'
import { test } from 'node:test'
import { partHeld } from '../page/parts.ts'

test('[44-7] the shift of the layout that a page measures is that of its largest window of shifts, not the sum of the visit', async () => {
  // A browser's measures as a test hands them: what watches each type is kept, so the test feeds it entries.
  const watchers = new Map<string, (list: { getEntries(): object[] }) => void>()
  const leaving: (() => void)[] = []
  class Observer {
    static supportedEntryTypes = ['layout-shift']
    heard: (list: { getEntries(): object[] }) => void
    constructor(heard: (list: { getEntries(): object[] }) => void) {
      this.heard = heard
    }
    observe(o: { type: string }): void {
      watchers.set(o.type, this.heard)
    }
  }
  const globals: Record<string, unknown> = {
    PerformanceObserver: Observer,
    document: { visibilityState: 'visible', addEventListener: () => undefined },
    window: { innerWidth: 800, addEventListener: (_: string, work: () => void) => void leaving.push(work) },
  }
  const before = new Map(Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]))
  for (const [name, value] of Object.entries(globals)) Reflect.set(globalThis, name, value)
  try {
    await import('../page/vitals/vitals.ts')
    const sent: string[] = []
    partHeld('vitals')?.measure({
      screen: 'shop',
      version: 'v1',
      moves: () => [],
      send: (body) => void sent.push(body),
    })
    const shift = (startTime: number, value: number) => ({ startTime, value, hadRecentInput: false })
    // Two shifts half a second apart make one window; one ten seconds later is a window of its own.
    watchers.get('layout-shift')?.({ getEntries: () => [shift(0, 0.1), shift(500, 0.1), shift(10000, 0.15)] })
    for (const work of leaving) work()
    const measures: { measure: string; value: number }[] = JSON.parse(sent[0] ?? '{}').measures ?? []
    const cls = measures.find((one) => one.measure === 'cls')?.value
    assert.ok(cls !== undefined && Math.abs(cls - 0.2) < 1e-9, `the shift measured is ${cls}`)
  } finally {
    for (const [name, value] of before)
      if (value === undefined) Reflect.deleteProperty(globalThis, name)
      else Reflect.set(globalThis, name, value)
  }
})
