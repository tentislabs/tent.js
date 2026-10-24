import type { Description } from '../../core/internal.ts'
import { isStored } from '../../core/internal.ts'

const textsOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((one) => typeof one === 'string' && !/[\s;,]/.test(one)) : []

/** Whether a screen or a component of the description opens the microphone, as the build read it from its hooks. */
const recordsSound = (description: Description): boolean =>
  [...Object.values(description.screens), ...Object.values(description.components)].some(
    (view) => isStored(view) && isStored(view.opens) && view.opens.microphone === true,
  )

/**
 * Takes a description, the scheme and the name that the app was reached by, who may show the screen in a frame,
 * and the nonce of the page where it has one. Answers the headers that every page is sent with: the content
 * policy, written from the description, which lets in a style tag and a script of the head by the nonce, and what
 * closes the device. No builder types them, and `unlock` of the project is the way out.
 */
export function pageHeaders(
  description: Description,
  origin: string,
  framedBy: unknown,
  nonce?: string,
): Record<string, string> {
  const project = description.project
  const unlock = isStored(project.unlock) ? project.unlock : {}
  const hosts = textsOf(project.hosts)
  const files = `${origin}/_t/b/`
  // The live connection is opened at the app's own address, by its own scheme.
  const live = origin.replace(/^http/, 'ws')
  // A frame inside the page shows the hosts that `unlock.frames` lists, and no other.
  const frames = textsOf(unlock.frames)
  // A browser leaves `'unsafe-inline'` unread beside a nonce: where `unlock` opens every style tag, no nonce is named.
  const byNonce = nonce === undefined ? [] : [`'nonce-${nonce}'`]
  const lines: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      files,
      ...byNonce,
      ...textsOf(unlock.scripts),
      ...(unlock.wasm === true ? ["'wasm-unsafe-eval'"] : []),
      ...(unlock.eval === true ? ["'unsafe-eval'"] : []),
    ],
    'style-src': [files, ...textsOf(unlock.styles), ...(unlock.styleTags === true ? ["'unsafe-inline'"] : byNonce)],
    'style-src-attr': ["'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', ...hosts],
    'media-src': ["'self'", 'blob:', ...hosts],
    'font-src': ["'self'", ...textsOf(unlock.fonts)],
    'connect-src': ["'self'", live, ...hosts],
    'frame-src': frames.length ? frames : ["'none'"],
    'frame-ancestors': framedBy === 'anyone' ? ['*'] : textsOf(framedBy).length ? textsOf(framedBy) : ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'self'"],
  }
  if (unlock.blobWorkers === true) lines['worker-src'] = ["'self'", 'blob:']
  // Any other source is added to a line of the policy by that line's standard name.
  for (const [line, more] of Object.entries(isStored(unlock.more) ? unlock.more : {}))
    if (/^[a-z-]+$/.test(line))
      lines[line] = [...(lines[line] ?? []).filter((one) => one !== "'none'"), ...textsOf(more)]
  // The camera, the microphone and the place of the device are closed, and opened for the app's own address alone
  // where `unlock` says so. A screen or a component that records opens the microphone for the whole app, so a move
  // between screens needs no new headers.
  const closed: Record<string, string> = { camera: 'camera', microphone: 'microphone', geolocation: 'location' }
  const opened: Record<string, unknown> = { ...unlock, ...(recordsSound(description) ? { microphone: true } : {}) }
  return {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'content-security-policy': Object.entries(lines)
      .map(([line, sources]) => `${line} ${sources.join(' ')}`)
      .join('; '),
    'permissions-policy': Object.entries(closed)
      .map(([name, unlocked]) => `${name}=(${opened[unlocked] === true ? 'self' : ''})`)
      .join(', '),
  }
}
