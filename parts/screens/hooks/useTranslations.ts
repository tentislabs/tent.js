import { useStore } from '../page/context.ts'
import { shown } from '../page/format.ts'
import { textOf } from '../page/spoken.ts'

/** How a value is shown: by its kind, or with the currency of money and the digits after the point. */
export type ValueFormat =
  | 'number'
  | 'currency'
  | 'percent'
  | 'date'
  | 'time'
  | 'dateTime'
  | 'relative'
  | { as?: Exclude<ValueFormat, object>; currency?: string; digits?: number }

/** What a view reads the messages of the app through, and how it shows a value. */
export interface Translations {
  t(key: string, values?: Record<string, unknown>): string
  // In the language of the page; a moment in the zone of the page.
  format(value: unknown, as: ValueFormat): string
  language: string
  languages: string[]
  zone: string
}

/**
 * Answers `{ t, format, language, languages, zone }`: `t('greeting', { name })` is the text of the key in the
 * language of the page, with its places filled, and a plural message in the form of `count`; `format(value, as)` writes
 * a value as the engine knows to write it, in the language of the page, in the viewer's zone, and money in the
 * project's currency; `zone` is the zone the page writes in.
 */
export function useTranslations(): Translations {
  const store = useStore()
  const { language, languages, zone } = store.page
  return {
    t: (key, values) => textOf(store.words, key, values, language),
    format: (value, as) => shown(value, as, store.page, Date.now()),
    language,
    languages,
    zone,
  }
}
