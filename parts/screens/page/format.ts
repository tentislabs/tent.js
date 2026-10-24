import type { Page } from './types.ts'
import { isStored } from '../../core/internal.ts'

/** The moment that a value stands for: a moment as it travels is text in the standard form. */
function momentOf(value: unknown): Date | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? undefined : moment
}

/** A day has no zone: it is shown as the day it names, wherever the viewer is. */
const isDay = (value: unknown): boolean => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

/** The steps of time, from the largest, each with its length in seconds. */
const steps: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000],
  ['month', 2592000],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
]

/**
 * Takes a value, the format that `useTranslations` is handed for it, and the page. Answers the words that show it, written
 * by the standard formatting of the runtime in the language of the page. A value that its format cannot show is
 * shown as it is.
 */
export function shown(value: unknown, format: unknown, page: Page, now: number): string {
  if (value === undefined || value === null || value === false || value === true) return ''
  const o = isStored(format) ? format : {}
  const as = typeof format === 'string' ? format : typeof o.as === 'string' ? o.as : o.currency ? 'currency' : ''
  const digits =
    typeof o.digits === 'number' ? { minimumFractionDigits: o.digits, maximumFractionDigits: o.digits } : {}
  const language = page.language
  if (as === 'number' || as === 'percent' || as === 'currency') {
    const number = Number(value)
    if (typeof value === 'object' || Number.isNaN(number)) return String(value)
    if (as === 'number') return new Intl.NumberFormat(language, digits).format(number)
    if (as === 'percent') return new Intl.NumberFormat(language, { style: 'percent', ...digits }).format(number)
    const currency = typeof o.currency === 'string' ? o.currency : page.currency
    if (currency === undefined) return String(value)
    try {
      const money = new Intl.NumberFormat(language, { style: 'currency', currency, ...digits })
      // Money is a whole number of the smallest unit, and one that is not whole is rounded to the nearest first.
      const parts =
        new Intl.NumberFormat(language, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
      return money.format(Math.round(number) / 10 ** parts)
    } catch {
      return String(value)
    }
  }
  if (as === 'date' || as === 'time' || as === 'dateTime' || as === 'relative') {
    const moment = momentOf(value)
    if (!moment) return String(value)
    if (as === 'relative') {
      const seconds = (moment.getTime() - now) / 1000
      const [unit, length] = steps.find(([, size]) => Math.abs(seconds) >= size) ?? ['minute', 60]
      return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(Math.trunc(seconds / length), unit)
    }
    const day: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
    const time: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
    const parts = as === 'date' ? day : as === 'time' ? time : { ...day, ...time }
    try {
      return new Intl.DateTimeFormat(language, { ...parts, timeZone: isDay(value) ? 'UTC' : page.zone }).format(moment)
    } catch {
      return new Intl.DateTimeFormat(language, parts).format(moment)
    }
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}
