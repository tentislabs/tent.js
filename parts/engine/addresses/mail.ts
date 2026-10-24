import { TentError } from '../../core/index.ts'
import type { Address } from '../door/address.ts'
import type { KeptMail } from '../mail/mailbox.ts'
import { sentMail } from '../mail/mailbox.ts'
import { fromHere, namesHere } from '../web/proxy.ts'
import { errorAnswer } from '../wire.ts'

const prefix = '/_t/mail'

/** A text written into a page, so that nothing in it is read as markup. */
const shown = (text: string): string => text.replace(/[&<>"']/g, (sign) => `&#${sign.charCodeAt(0)};`)

/** Words of a text message with their addresses of the web made links, as a mail program shows them. */
const linked = (text: string): string =>
  shown(text).replace(/https?:\/\/[^\s<>&#]+/g, (url) => `<a href="${url}">${url}</a>`)

/** The page that lists the messages, the newest first, each with its head and its body in a frame of its own. */
function listPage(mails: KeptMail[]): string {
  const items = mails.map((one) => {
    const head = [
      `<p><b>${shown(one.subject)}</b> <small>${new Date(one.at).toISOString()}</small></p>`,
      `<p>From ${shown(one.from ?? '')} to ${shown(one.to.join(', '))}${one.cc ? `, cc ${shown(one.cc.join(', '))}` : ''}${one.bcc ? `, bcc ${shown(one.bcc.join(', '))}` : ''}</p>`,
      one.files ? `<p>Files: ${shown(one.files.join(', '))}</p>` : '',
    ].join('')
    return `<li>${head}<iframe src="${prefix}/${one.id}" sandbox="allow-popups allow-popups-to-escape-sandbox" title="${shown(one.subject)}"></iframe></li>`
  })
  const style =
    'body{font:15px system-ui,sans-serif;margin:24px;max-width:900px}li{list-style:none;border-top:1px solid #ccc;padding:12px 0}iframe{width:100%;height:320px;border:1px solid #ddd}'
  return `<!doctype html><html><head><meta charset="utf-8"><title>Mail of the app</title><style>${style}</style></head><body><h1>Mail that the app sent</h1><p>The newest first, the last 100, kept while the program runs. Nothing here was sent.</p><ul>${items.join('') || '<li>No message yet.</li>'}</ul></body></html>`
}

/** One message as its receiver would see it: its HTML, or its text, with each link opening in a page of its own. */
function messagePage(one: KeptMail): string {
  const body =
    one.html ?? `<pre style="white-space:pre-wrap;font:15px system-ui,sans-serif">${linked(one.text ?? '')}</pre>`
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"></head><body>${body}</body></html>`
}

/**
 * `GET /_t/mail` and `GET /_t/mail/<id>`, in the mode `development`: the messages the app sent, and one of them as
 * its receiver would see it. From this computer alone, through no proxy and by its own names; and nowhere in another
 * mode. Whatever else is asked is not found, in the same words. A message is shown in a frame
 * that runs nothing of it and whose links open apart.
 */
export const address: Address = {
  order: 1,
  match(request) {
    const { pathname } = new URL(request.url)
    return request.method === 'GET' && (pathname === prefix || pathname.startsWith(`${prefix}/`)) && { name: prefix }
  },
  steps: [1, 2],
  async handle({ app, request, about }) {
    try {
      const path = new URL(request.url).pathname
      const id = path === prefix ? undefined : path.slice(prefix.length + 1)
      const mails = app.mode === 'development' && fromHere(about) && namesHere(about) ? sentMail(app) : undefined
      const one = id === undefined ? undefined : mails?.find((mail) => mail.id === id)
      if (!mails || (id !== undefined && !one))
        throw new TentError('T0001', 'This page cannot be opened.', {
          fix: 'The mail of an app in development is read at `/_t/mail` from the computer that runs it, or with `tent logs --mail`.',
        })
      const headers = {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      }
      if (one)
        return new Response(messagePage(one), {
          headers: {
            ...headers,
            'content-security-policy':
              "sandbox allow-popups allow-popups-to-escape-sandbox; default-src 'none'; img-src * data:; style-src 'unsafe-inline'; font-src * data:",
          },
        })
      return new Response(listPage(mails), {
        headers: {
          ...headers,
          'content-security-policy':
            "default-src 'none'; style-src 'unsafe-inline'; frame-src 'self'; frame-ancestors 'none'",
        },
      })
    } catch (error) {
      return errorAnswer(app, prefix, error)
    }
  },
}
