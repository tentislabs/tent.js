import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from '../borrowed/react.ts'
import type { Page } from '../draw.ts'
import type { ValueFormat } from '../index.ts'
import { screen, useTranslations } from '../index.ts'
import { described, drawingOf, drawn, unescaped } from './drawn.ts'

const moment = '2026-03-08T21:45:00.000Z'

/** The values a view shows, each with its format, and what each is shown as on the page, read from its element. */
const shownBy: [string, unknown, ValueFormat][] = [
  ['number', 1234567.891, 'number'],
  ['digits', 7.12345, { as: 'number', digits: 2 }],
  ['percent', 0.5, 'percent'],
  ['money', 199999, 'currency'],
  ['rounded', 1999.6, 'currency'],
  ['euros', 1999, { currency: 'EUR' }],
  ['date', moment, 'date'],
  ['time', moment, 'time'],
  ['dateTime', moment, 'dateTime'],
  ['day', '2026-03-08', 'date'],
]

/** Draws a view that shows each value by `format`, on a page in a language and a zone. Answers what each showed. */
async function formatted(page: Partial<Page>): Promise<Record<string, string>> {
  const view = () => {
    const { format, zone, language } = useTranslations()
    return createElement(
      'dl',
      null,
      createElement('dt', { id: 'zone' }, zone),
      createElement('dt', { id: 'language' }, language),
      ...shownBy.map(([name, value, as]) => createElement('dd', { key: name, id: name }, format(value, as))),
    )
  }
  const description = described([screen('prices', { path: '/prices', access: 'anyone', view: () => null })])
  const made = await drawn(description, 'prices', {
    page: { languages: ['en', 'tr'], ...page },
    views: { prices: { name: 'prices', kind: 'screen', view } },
  })
  const drawing = unescaped(drawingOf(made.html))
  return Object.fromEntries([...drawing.matchAll(/<d[td] id="([^"]+)">([^<]*)</g)].map((one) => [one[1], one[2]]))
}

/** What the standard formatting of the runtime writes, which the page writes too. */
function expected(language: string, zone: string): Record<string, string> {
  const money = (amount: number, currency: string) =>
    new Intl.NumberFormat(language, { style: 'currency', currency }).format(amount)
  const day = { day: 'numeric', month: 'short', year: 'numeric' } as const
  const time = { hour: 'numeric', minute: '2-digit' } as const
  const at = new Date(moment)
  return {
    number: new Intl.NumberFormat(language).format(1234567.891),
    digits: new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(7.12345),
    percent: new Intl.NumberFormat(language, { style: 'percent' }).format(0.5),
    money: money(1999.99, 'USD'),
    // Money that is not whole is rounded to the nearest whole number of the smallest unit first.
    rounded: money(20, 'USD'),
    euros: money(19.99, 'EUR'),
    date: new Intl.DateTimeFormat(language, { ...day, timeZone: zone }).format(at),
    time: new Intl.DateTimeFormat(language, { ...time, timeZone: zone }).format(at),
    dateTime: new Intl.DateTimeFormat(language, { ...day, ...time, timeZone: zone }).format(at),
    // A day has no zone: it is the day it names, wherever the viewer is.
    day: new Intl.DateTimeFormat(language, { ...day, timeZone: 'UTC' }).format(new Date('2026-03-08')),
  }
}

test('[30-5] format of useTranslations writes each value as the standard formatting of the runtime does, in the language of the page and in its zone, in two languages', async () => {
  for (const [language, zone] of [
    ['en', 'UTC'],
    ['tr', 'Asia/Tokyo'],
  ]) {
    const shown = await formatted({ language, zone, currency: 'USD' })
    const { zone: told, language: spoken, ...values } = shown
    assert.equal(told, zone)
    assert.equal(spoken, language)
    assert.deepEqual(values, expected(language, zone), `${language} in ${zone}`)
  }
})

test('[30-5] a moment shown in another zone is another time of day, and a day stays the day it names', async () => {
  const here = await formatted({ zone: 'UTC', currency: 'USD' })
  const there = await formatted({ zone: 'Asia/Tokyo', currency: 'USD' })
  assert.notEqual(here.time, there.time)
  assert.equal(here.day, there.day)
})
