import { isStored } from '../../core/internal.ts'
import type { Address } from '../door/address.ts'
import { countedFor } from '../door/rate.ts'
import { sameOrigin } from '../door/web.ts'
import { storedLimit } from '../limits.ts'
import { vitalsSentOut } from '../trace/export.ts'
import { servedBy } from '../versions.ts'
import { deviceOf, measures } from '../vitals/measures.ts'
import { countedAs } from '../web/names.ts'
import { bodyOf } from '../web/body.ts'

const path = '/_t/vitals'

// The most bytes a page sends of its measures, and the most measures in one sending.
const most = 16_384
const mostMeasures = 64

/**
 * `POST /_t/vitals`: the measures a page of the app took of what its visitor saw, sent once when it was hidden.
 * A request from a page of the app's own origin alone is taken, `limits.vitalsPerMinute` from one address; each
 * value is held to the range its measure can have, and to a screen and a version the app holds. What is kept is
 * the screen, the version, the measure, its value, the kind of device and of connection, and nothing that says
 * whose visit it was. Everything else is dropped, and every request is answered 204 alike.
 */
export const address: Address = {
  order: 1,
  match(request) {
    return request.method === 'POST' && new URL(request.url).pathname === path && {}
  },
  steps: [1],
  async handle({ app, request, about }) {
    const none = (): Response => new Response(null, { status: 204, headers: { 'x-content-type-options': 'nosniff' } })
    const origin = request.headers.get('origin')
    if (origin === null || !sameOrigin(origin, about.origin)) return none()
    if (!countedFor(app, `vitals:${countedAs(about.from)}`, storedLimit(app.description, 'vitalsPerMinute')))
      return none()
    let body: unknown
    try {
      // The body is read within its bound as it arrives, and never whole before it is held to it.
      body = JSON.parse(new TextDecoder().decode(await bodyOf(request, most)))
    } catch {
      return none()
    }
    if (!isStored(body) || typeof body.version !== 'string' || !Array.isArray(body.measures)) return none()
    const served = servedBy(app, body.version)
    if (!served) return none()
    const width = typeof body.width === 'number' && body.width > 0 && body.width < 100_000 ? body.width : 0
    const connection =
      typeof body.connection === 'string' && /^[a-z0-9-]{1,16}$/.test(body.connection) ? body.connection : ''
    const at = app.clock.now()
    const rows = body.measures.slice(0, mostMeasures).flatMap((one) => {
      if (!isStored(one) || typeof one.screen !== 'string' || typeof one.measure !== 'string') return []
      const bound = Object.hasOwn(measures, one.measure) ? measures[one.measure] : undefined
      const value = one.value
      if (!bound || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > bound.most) return []
      if (!Object.hasOwn(served.description.screens, one.screen)) return []
      return [
        {
          at,
          screen: one.screen,
          version: served.version,
          measure: one.measure,
          value: Math.round(value * 1000) / 1000,
          device: deviceOf(width),
          connection,
        },
      ]
    })
    if (rows.length) {
      app.log.writeAll('vitals', rows)
      vitalsSentOut(app, rows)
    }
    return none()
  },
}
