import { holdPart } from '../parts.ts'
import type { Overlay } from '../reach.ts'
import { thrown } from './thrown.ts'
import { isStored } from '../../../core/internal.ts'

// The overlay lies over everything of the page, along its lower edge, and is the page code's own: it is drawn with
// no tag of the page and no style of the project, so that it shows whatever state the screen is in.
const look =
  'position:fixed;left:0;right:0;bottom:0;max-height:60vh;overflow:auto;margin:0;padding:12px 16px;z-index:2147483647;' +
  'background:#18181b;color:#f4f4f5;border-top:3px solid #ef4444;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;' +
  'white-space:pre-wrap;box-sizing:border-box'

/** A place of the project: its file, its line and its column. */
const placeOf = (place: Record<string, unknown>): string =>
  `${String(place.file)}:${String(place.line)}:${String(place.column)}`

/**
 * The lines that a failure while running is shown in: its code, its words and what failed, the place in the
 * project's source, the lines around it, and the chain of calls with each run of the framework or of a package
 * folded into one line.
 */
function failureLines(failure: Record<string, unknown>): string[] {
  const where = isStored(failure.where) ? failure.where : undefined
  const lines = Array.isArray(failure.lines) ? failure.lines.filter(isStored) : []
  const wide = String(Math.max(0, ...lines.map((one) => Number(one.line)))).length
  const calls = Array.isArray(failure.calls) ? failure.calls.filter(isStored) : []
  return [
    `${String(failure.code)} ${String(failure.message)}${typeof failure.failed === 'string' ? ` (${failure.failed})` : ''}`,
    ...(where ? [`  at ${placeOf(where)}`] : []),
    // The trace of the failure, with the command that prints its tree on this computer.
    ...(typeof failure.trace === 'string' ? [`  trace ${failure.trace}: tent logs --trace ${failure.trace}`] : []),
    ...lines.map(
      (one) => `${one.line === where?.line ? '  >' : '   '} ${String(one.line).padStart(wide)} | ${String(one.text)}`,
    ),
    '  calls:',
    ...calls.map((call) =>
      typeof call.folded !== 'number'
        ? `    ${typeof call.name === 'string' ? `${call.name} ` : ''}${placeOf(call)}`
        : call.of === 'package'
          ? `    … ${call.folded} in the package ${String(call.package)}, ${String(call.file)}`
          : `    … ${call.folded} of the framework`,
    ),
  ]
}

/** The lines that one finding is shown in: its code and its words, where it is, and its fix. */
function linesOf(finding: unknown): string[] {
  if (!isStored(finding)) return [String(finding)]
  if (Array.isArray(finding.calls)) return failureLines(finding)
  const where = isStored(finding.where) ? finding.where : undefined
  const at = where && typeof where.file === 'string' ? `${where.file}${where.line ? `:${String(where.line)}` : ''}` : ''
  return [
    `${String(finding.code ?? '')} ${String(finding.message ?? '')}`.trim(),
    ...(at ? [`  at ${at}`] : []),
    ...(typeof finding.fix === 'string' ? [`  fix: ${finding.fix}`] : []),
  ]
}

/**
 * Takes the document of a page in development. Answers what shows an overlay over the page: one line for each
 * finding, with where it is and its fix, and one for each thing that the content policy blocked, with the entry of
 * `unlock` that would open it. With nothing to show, the overlay is taken away. Every text is written as text.
 */
export function overlayOn(document: Document): (shown: Overlay) => void {
  let panel: HTMLElement | undefined
  return (shown) => {
    const texts = [
      ...shown.findings.map((one) => linesOf(one).join('\n')),
      ...shown.blocked.map(
        (one) =>
          `The content policy of the page blocked ${one.uri} (${one.directive}).\n  fix: to open it, state ${one.unlock} in \`project\`.`,
      ),
    ]
    if (!texts.length) {
      panel?.remove()
      panel = undefined
      return
    }
    if (!panel) {
      panel = document.createElement('div')
      panel.id = 'tent-overlay'
      panel.setAttribute('role', 'alert')
      panel.style.cssText = look
      document.body.append(panel)
    }
    panel.replaceChildren(
      ...texts.map((text) => {
        const entry = document.createElement('p')
        entry.style.cssText = 'margin:0 0 8px'
        entry.textContent = text
        return entry
      }),
    )
  }
}

// The mark that what the views keep stayed through a save of the look alone: quiet, at the top of the page, and the
// page code's own, as the overlay is.
const markLook =
  'position:fixed;top:8px;right:8px;z-index:2147483647;margin:0;padding:4px 8px;background:#18181b;color:#d4d4d8;' +
  'border-radius:4px;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace'

/**
 * Takes the document of a page in development. Answers what shows the mark "state kept" after a swap of Fast Refresh,
 * with its reset: a press of it, or of the key it names, Alt+Shift+R, resets the screen that is shown. With nothing to
 * reset, the mark is taken away.
 */
export function markOn(document: Document): (reset: (() => void) | undefined) => void {
  let mark: HTMLElement | undefined
  let reset: (() => void) | undefined
  document.addEventListener('keydown', (event) => {
    if (!reset || !event.altKey || !event.shiftKey || event.code !== 'KeyR') return
    event.preventDefault()
    reset()
  })
  return (given) => {
    reset = given
    if (!given) {
      mark?.remove()
      mark = undefined
      return
    }
    if (mark) return
    mark = document.createElement('p')
    mark.id = 'tent-kept'
    mark.style.cssText = markLook
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'reset'
    button.style.cssText =
      'margin:0 6px;font:inherit;color:inherit;background:none;border:1px solid #52525b;border-radius:3px'
    button.addEventListener('click', () => reset?.())
    mark.append(document.createTextNode('state kept'), button, document.createTextNode('Alt+Shift+R'))
    document.body.append(mark)
  }
}

holdPart('overlay', { overlayOn, thrown, markOn })
