import { zoneCookie } from '../../core/internal.ts'
/** The value of one cookie among those that a request sent, or an empty text where it sent none of that name. */
export function cookieSent(sent: string | null, name: string): string {
  for (const part of (sent ?? '').split(';')) {
    const at = part.indexOf('=')
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim()
  }
  return ''
}

/** The time zone of the viewer, as the page keeps it in its cookie: nothing where it names none. */
export function zoneOf(cookies: string | null): string | undefined {
  let zone: string
  try {
    zone = decodeURIComponent(cookieSent(cookies, zoneCookie))
  } catch {
    return undefined
  }
  if (!/^[A-Za-z0-9_+/-]{1,64}$/.test(zone)) return undefined
  try {
    return new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone
  } catch {
    return undefined
  }
}
