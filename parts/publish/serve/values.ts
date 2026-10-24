import { TentError } from '../../core/index.ts'
import type { App, ServedRequest } from '../../engine/index.ts'

/**
 * Answers `/_t/publish/values`: sets or removes a secret or a setting of the app's mode, or lists the names that
 * are set, and never a value. A name that no definition of the running version names is taken all the same: the
 * next version may. Throws T9104 for a key without `publish`, and T0002 for a body that does not fit.
 */
export async function valuesAnswer(app: App, asked: ServedRequest): Promise<Response> {
  if (!asked.key.rights.includes('publish'))
    throw new TentError('T9104', 'Secrets and settings need a key with the right `publish`.', {
      fields: { right: 'publish' },
    })
  let body: Record<string, unknown>
  try {
    body = Object(await asked.request.json())
  } catch {
    throw new TentError('T0002', 'The body is a record in the wire form.', { fields: { body: 'type' } })
  }
  const answer = (value: unknown): Response =>
    new Response(JSON.stringify({ ok: true, value }), { headers: { 'content-type': 'application/json' } })
  if (body.list === true) {
    const [secrets, settings] = [
      await app.values({ kind: 'secret', list: true }),
      await app.values({ kind: 'setting', list: true }),
    ]
    const shown: unknown = Object(settings).settings
    const named = (Array.isArray(shown) ? shown : [])
      .filter((one) => Object(one).set === true)
      .map((one) => String(Object(one).name))
    return answer({ secrets: Object(secrets).set ?? [], settings: named })
  }
  if ((body.kind !== 'secret' && body.kind !== 'setting') || typeof body.name !== 'string')
    throw new TentError('T0002', 'Name `kind`, `secret` or `setting`, and `name`.', { fields: { kind: 'type' } })
  await app.values({
    kind: body.kind,
    name: body.name,
    ...(body.remove === true ? { remove: true } : { value: body.value }),
    ...(body.written === true ? { written: true } : {}),
  })
  return answer(null)
}
