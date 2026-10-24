import { isStored } from '../../../core/internal.ts'
import { holdPart } from '../parts.ts'
import type { Words } from '../spoken.ts'
import { textOf } from '../spoken.ts'

/**
 * Takes the base of an exported page and the name of its app. Asks `/_t/health` under the base, once: an engine
 * stands behind the page only where that answers in the wire form with the name of the app. Any other answer, as
 * a page of the host's own with the status 200, means none.
 */
export async function engineBehind(base: string, app: string | undefined): Promise<boolean> {
  try {
    const answer = await fetch(`${base}/_t/health`, { credentials: 'same-origin', cache: 'no-store' })
    if (answer.status !== 200) return false
    const body: unknown = await answer.json()
    return isStored(body) && body.ok === true && isStored(body.value) && body.value.app === app
  } catch {
    return false
  }
}

/**
 * Takes the base of an exported page, the version it was exported with, and the address of a request for a
 * screen again. Answers the file under `_t/s/` that holds the answer for that address, where the request names
 * the version of the export; nothing for any other request, which only an engine can answer.
 */
export function exportedFile(base: string, version: string, address: string): string | undefined {
  if (!address.startsWith('/_t/screen?')) return undefined
  const asked = new URLSearchParams(address.slice('/_t/screen?'.length))
  const path = asked.get('path')
  if (asked.get('version') !== version || path === null || !path.startsWith('/') || path.startsWith('//'))
    return undefined
  // The state in the address shows the answers of the address that was exported: the file is named by the path.
  const plain = path.split(/[?#]/)[0]
  return `${base}/_t/s/${plain === '/' ? 'index' : plain.slice(1).replace(/\/$/, '')}.json`
}

/**
 * Takes the words of the page. Answers what a call of an exported page answers where no engine stands behind it: at
 * once, with no request, and in the language of the page.
 */
export const noEngine = (words: Words): unknown => ({
  ok: false,
  error: { code: 'T0001', message: textOf(words, 'tent.noEngine') },
})

holdPart('exported', { engineBehind, exportedFile, noEngine })
