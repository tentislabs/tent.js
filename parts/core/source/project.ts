import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import type { Doc } from './doc.ts'
import { recordDoc } from './doc.ts'
import type { Form } from './plain.ts'
import { entryDocs, fieldsDoc, plainDoc } from './plain.ts'
import { keyText } from './texts.ts'
import { typeDoc } from './type.ts'
import type { Writing } from './writing.ts'
import { noText } from './writing.ts'
import { marked } from './marked.ts'

/** The states of a project, of a screen or of a component: each its type, or its type with where it is kept. */
const stateForm: Form = (w, state) =>
  recordDoc(
    Object.entries(isStored(state) ? state : {}).map(([name, one]) => [
      `${keyText(name)}: `,
      isStored(one) && typeof one.kind !== 'string' ? fieldsDoc(w, one, { type: 'type' }) : typeDoc(w, one),
    ]),
  )

/** The limits of a project, one to a line in the order they are stored: a time and a size in words, a count as it is. */
const limits: Form = (w, stored) =>
  isStored(stored)
    ? fieldsDoc(
        w,
        stored,
        Object.fromEntries(Object.keys(stored).map((name) => [name, marked('project', 'limits', name)])),
        true,
      )
    : plainDoc(w, stored)

/** A record by name of records that share their forms, as the settings and the kinds of worker are. */
const each =
  (forms: { [field: string]: Form }): Form =>
  (w, stored) =>
    recordDoc(
      Object.entries(isStored(stored) ? stored : {}).map(
        ([name, one]): Doc => [`${keyText(name)}: `, isStored(one) ? fieldsDoc(w, one, forms) : plainDoc(w, one)],
      ),
    )

/**
 * The options of a project, in the order they are written. A definition that the project names is written as its
 * name in text, so that the file of the project imports no file that may import it. Throws T0013 for a project
 * that states `identify`, `onRequest` or `build`, which are code.
 */
export function projectEntries(w: Writing, project: Stored): Doc[] {
  for (const code of ['identify', 'onRequest', 'build'])
    if (project[code] !== undefined) throw noText(`A project that states \`${code}\``)
  return entryDocs(w, project, {
    title: 'plain',
    languages: 'plain',
    zone: 'plain',
    currency: 'plain',
    icon: 'plain',
    head: 'plain',
    state: stateForm,
    signInPath: 'plain',
    uploads: 'rule',
    images: 'plain',
    cookies: 'plain',
    cli: 'plain',
    mcp: {
      toolsListed: 'plain',
      asks: 'plain',
      only: 'plain',
      clients: 'plain',
      on: 'plain',
      anyone: 'plain',
      stream: 'plain',
      scopes: 'plain',
      inline: marked('project', 'mcp', 'inline'),
    },
    python: 'plain',
    describeTo: 'rule',
    api: 'plain',
    roots: 'plain',
    trailingSlash: 'plain',
    settings: each({ type: 'type' }),
    mail: 'plain',
    limits,
    redirects: 'plain',
    hosts: 'plain',
    unlock: 'plain',
    privateHosts: 'plain',
    hold: 'plain',
    countBy: 'plain',
    workers: each({
      wait: marked('project', 'workers', '*', 'wait'),
      idleAfter: marked('project', 'workers', '*', 'idleAfter'),
    }),
    backups: { every: marked('project', 'backups', 'every') },
    history: 'plain',
    publish: { health: 'plain', within: marked('project', 'publish', 'within') },
    cache: 'plain',
    release: { every: marked('project', 'release', 'every') },
    trace: 'plain',
    vitals: 'plain',
    removed: 'plain',
    was: 'was',
  })
}
