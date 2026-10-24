import { apiDocsOf, fingerprintOf, offeredToApi, openApiOf } from '../../core/internal.ts'
import type { Step } from '../work.ts'

/**
 * Writes the description of the API and its docs page into the bundle, from the description as it stands before
 * the built files are written into it, for a project that offers something to the API: `api/openapi.<print>.json`
 * and `api/docs.<print>.html`. Nothing of them is worked out while the app runs.
 */
export const step: Step = {
  order: 8.5,
  run: async (work) => {
    if (!work.description || !offeredToApi(work.description).length) return
    const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
    const openapi = encode(`${JSON.stringify(openApiOf(work.description), null, 2)}\n`)
    const docs = encode(apiDocsOf(work.description))
    const files = {
      openapi: `api/openapi.${fingerprintOf(openapi).slice(0, 12)}.json`,
      docs: `api/docs.${fingerprintOf(docs).slice(0, 12)}.html`,
    }
    work.bundle.set(files.openapi, openapi)
    work.bundle.set(files.docs, docs)
    work.api = files
  },
}
