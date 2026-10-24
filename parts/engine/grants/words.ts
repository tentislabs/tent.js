import type { Description } from '../../core/internal.ts'
import { isStored, projectLanguages } from '../../core/internal.ts'
import { ownStyle } from '../pages/own.ts'

/** The words of the pages that ask a person, in English, which a language file of the project may give anew. */
const english: Record<string, string> = {
  'tent.grant.title': '{name} wants to act for you in {app}',
  'tent.grant.read': 'Read your data',
  'tent.grant.write': 'Read and change your data',
  'tent.grant.allow': 'Allow',
  'tent.grant.refuse': 'Refuse',
  'tent.grant.app': 'This program will act as you in the whole app.',
  'tent.grant.named': 'This program named itself.',
  'tent.grant.here': 'a program on this computer',
  'tent.grant.word': 'The word your program shows: {word}',
  'tent.ask.title': 'Run {tool}?',
  'tent.ask.allow': 'Yes',
  'tent.ask.refuse': 'No',
  'tent.ask.done': 'This was answered.',
  'tent.ask.more': 'More may be asked after these.',
}

/** Writes a text as text in HTML: each character that means something there as its name. */
export const asText = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (one) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[one] ?? one,
  )

/** The language of a request among the project's: the first that the browser asks for, or the project's first. */
export function languageOf(description: Description, accepted: string | null): string {
  const languages = projectLanguages(description.project)
  const asked = (accepted ?? '')
    .split(',')
    .map((one) => one.split(';')[0].trim().toLowerCase())
    .filter(Boolean)
  for (const one of asked) {
    const found = languages.find((language) => language === one || language === one.split('-')[0])
    if (found) return found
  }
  return languages[0] ?? 'en'
}

/** A message of the project in a language, with its places filled, and the English one where none is given. */
export function grantWordOf(
  description: Description,
  language: string,
  key: string,
  filled: Record<string, string> = {},
): string {
  const held: unknown = Reflect.get(Object(description.messages), language)
  const given = isStored(held) && typeof held[key] === 'string' ? held[key] : undefined
  const word = given ?? english[key] ?? key
  return word.replace(/\{(\w+)\}/g, (all, name: string) => filled[name] ?? all)
}

/**
 * The lines of a page that asks a person: the policy of a page with no script, which no site may show in a frame,
 * and whose form's answer may lead to its own app and, where it is given, to one host more.
 */
export function askingLines(leadsTo?: string): Record<string, string> {
  const leads = leadsTo && /^https?:\/\//.test(leadsTo) ? ` ${leadsTo}` : ''
  return {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    // Its form sends the page's origin, which the door holds it to; another site is told no referrer.
    'referrer-policy': 'same-origin',
    'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'${leads}; frame-ancestors 'none'; base-uri 'none'`,
  }
}

/** The head and the style of a page that asks a person, in the system's colors. */
export function pageHead(language: string, title: string): string {
  return [
    '<!doctype html>',
    `<html lang="${asText(language)}">`,
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    // The one look of the pages of the engine, with the choice to allow in the system's color of what stands out.
    `<style>${ownStyle()}button[value=allow]{background:AccentColor;color:AccentColorText;border-color:AccentColor}</style></head>`,
  ].join('\n')
}
