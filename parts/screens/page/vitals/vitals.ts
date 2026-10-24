import { holdPart } from '../parts.ts'

/** One measure of a page view: the screen it is of, its name, and its value. */
interface Measure {
  screen: string
  measure: string
  value: number
}

/** What the part is handed of the page: the screen it was loaded with, its version, its moves, and where to send. */
export interface Measuring {
  screen: string
  version: string
  // The moves between screens so far, each with the screen it went to and how long it took, in milliseconds.
  moves(): { screen: string; ms: number }[]
  send(body: string): void
}

/** Watches entries of one type of the browser's own measures, where the browser has them, with those already there. */
function watched(type: string, heard: (entries: PerformanceEntry[]) => void, more: object = {}): boolean {
  if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return false
  try {
    new PerformanceObserver((list) => heard(list.getEntries())).observe({ type, buffered: true, ...more })
    return true
  } catch {
    // A browser that names the type and will not watch it measures nothing of it.
    return false
  }
}

/**
 * Measures what the visitor of a page sees, by the browser's own measures: the time to the largest content, the
 * delay of a press, the shift of the layout, the time to the first byte, and the time of each move between
 * screens. Sends them once, when the page is hidden, as one request that the browser sends even as the page goes.
 */
function measure(o: Measuring): void {
  let largest: number | undefined
  let shifted = 0
  let delay: number | undefined
  watched('largest-contentful-paint', (entries) => {
    const last = entries.at(-1)
    if (last) largest = last.startTime
  })
  // The shift of the layout is that of its largest window, as Google's measure has it: shifts less than a second
  // apart, within five seconds, count together, so a page that lives through many moves is not told worse for it.
  // https://web.dev/articles/cls
  let windowSum = 0
  let windowFirst = Number.NEGATIVE_INFINITY
  let windowLast = Number.NEGATIVE_INFINITY
  const shifts = watched('layout-shift', (entries) => {
    for (const entry of entries) {
      if (Reflect.get(entry, 'hadRecentInput')) continue
      const value = Number(Reflect.get(entry, 'value') ?? 0)
      const at = entry.startTime
      if (at - windowLast < 1000 && at - windowFirst < 5000) windowSum += value
      else {
        windowSum = value
        windowFirst = at
      }
      windowLast = at
      shifted = Math.max(shifted, windowSum)
    }
  })
  watched(
    'event',
    (entries) => {
      for (const entry of entries)
        if (Number(Reflect.get(entry, 'interactionId') ?? 0) > 0) delay = Math.max(delay ?? 0, entry.duration)
    },
    { durationThreshold: 16 },
  )
  let sent = false
  const hidden = (going: boolean): void => {
    if (sent || (!going && document.visibilityState !== 'hidden')) return
    sent = true
    const [loaded] = performance.getEntriesByType('navigation')
    const first = Number(Reflect.get(loaded ?? {}, 'responseStart') ?? 0)
    const taken: Measure[] = [
      ...(first > 0 ? [{ screen: o.screen, measure: 'ttfb', value: first }] : []),
      ...(largest === undefined ? [] : [{ screen: o.screen, measure: 'lcp', value: largest }]),
      ...(shifts ? [{ screen: o.screen, measure: 'cls', value: shifted }] : []),
      ...(delay === undefined ? [] : [{ screen: o.screen, measure: 'inp', value: delay }]),
      ...o.moves().map((one) => ({ screen: one.screen, measure: 'move', value: one.ms })),
    ]
    const connection = String(Reflect.get(Object(Reflect.get(navigator, 'connection')), 'effectiveType') ?? '')
    o.send(JSON.stringify({ version: o.version, width: window.innerWidth, connection, measures: taken }))
  }
  document.addEventListener('visibilitychange', () => hidden(false))
  window.addEventListener('pagehide', () => hidden(true))
}

holdPart('vitals', { measure })
