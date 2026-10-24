import type { Description } from '../../core/internal.ts'
import { isStored } from '../../core/internal.ts'
import { fitsPattern } from './find.ts'

/** A `to` of a redirect with the values of its `from` put in their places, each written with its percent signs. */
function filled(to: string, params: Record<string, string>): string {
  return to
    .split('/')
    .map((part) => {
      if (part === '*') return (params.rest ?? '').split('/').map(encodeURIComponent).join('/')
      if (part.startsWith(':') && Object.hasOwn(params, part.slice(1))) return encodeURIComponent(params[part.slice(1)])
      return part
    })
    .join('/')
}

/**
 * Takes a description, the path of an address, and what stands after its question mark. Answers where the first
 * redirect of the project whose `from` the path fits sends a visitor: 308, or 307 for one that says
 * `permanent: false`, to its `to` with the values of `from` in it and the same question mark. Answers nothing
 * where no redirect fits. A `to` that is an outside address is taken as it is written: the builder wrote it.
 */
export function redirectFor(
  description: Description,
  path: string,
  search: string,
): { status: number; location: string } | undefined {
  const redirects = Array.isArray(description.project.redirects) ? description.project.redirects : []
  for (const one of redirects) {
    if (!isStored(one) || typeof one.from !== 'string' || typeof one.to !== 'string') continue
    const params = fitsPattern(one.from, path)
    if (!params) continue
    const outside = /^https?:\/\//i.test(one.to)
    const location = outside ? one.to : `${filled(one.to, params)}${search}`
    // A path that the values made into the address of another site leads nowhere.
    if (!outside && (!location.startsWith('/') || location.startsWith('//') || location.includes('\\')))
      return undefined
    return { status: one.permanent === false ? 307 : 308, location }
  }
  return undefined
}
