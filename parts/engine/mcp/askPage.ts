import type { Caller } from '../../core/index.ts'
import { isStored } from '../../core/internal.ts'
import { asText, askingLines, languageOf, pageHead, grantWordOf } from '../grants/words.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import type { Waiting } from './asked.ts'
import { madeText } from './texts.ts'
import { unframed } from '../pages/unframed.ts'

/** The fields of the input of a function of the app, by its name: a tool of an outside server has none. */
const fieldsOf = (o: Opened, name: string): unknown =>
  Object.hasOwn(o.description.functions, name) ? Reflect.get(Object(o.description.functions[name]), 'input') : {}

/** The input of a call as a person is shown it: a field marked `secret` as `[secret]`. */
function shownInput(o: Opened, name: string, input: unknown): Record<string, unknown> {
  const fields = fieldsOf(o, name)
  return Object.fromEntries(
    Object.entries(isStored(input) ? input : {}).map(([field, value]) => [
      field,
      Reflect.get(Object(isStored(fields) ? fields[field] : {}), 'secret') === true ? '[secret]' : value,
    ]),
  )
}

/**
 * The calls that the ask of a sequence lists, as a person reads them on the page: each with the title of its tool,
 * one of an outside server by the name after its dot, and its input with a field marked `secret` as `[secret]`;
 * and a last line where more may follow.
 */
function listedHtml(
  o: Opened,
  waiting: Waiting,
  titleOf: (name: string) => string,
  inputLines: (fields: unknown, input: unknown) => string[],
  said: (key: string) => string,
): string[] {
  if (!waiting.sequence) return []
  const calls = waiting.sequence.map((one) => {
    const tool = String(one.tool)
    const input = inputLines(fieldsOf(o, tool), one.input).join(', ')
    return `<li>${asText(`${titleOf(tool.split('.').at(-1) ?? tool)}${input ? `: ${input}` : ''}`)}</li>`
  })
  return [`<ul>${calls.join('')}</ul>`, ...(waiting.more ? [`<p>${said('tent.ask.more')}</p>`] : [])]
}

/**
 * The page where a person agrees to one call of a program: the title of its tool and its input, with "Yes" and
 * "No", on a page of the engine's own, plain HTML with no script that no site may show in a frame, or on the
 * project's own screen `for: 'ask'`, which is handed `ask`: for the ask of a sequence with every call it lists. Each answers with a text of the engine's own, for this
 * person and this call, which works once within `askTime`.
 */
export async function askPage(
  o: Opened,
  o2: { text: string; waiting: Waiting; caller: Caller; request: Request; origin: string },
): Promise<Response> {
  const { text, waiting, caller, request, origin } = o2
  const { titleOf, inputLines } = await import('../../connect/index.ts')
  const language = languageOf(o.description, request.headers.get('accept-language'))
  const said = (key: string, filled: Record<string, string> = {}): string =>
    asText(grantWordOf(o.description, language, key, filled))
  const title = titleOf(waiting.name)
  const lines = askingLines()
  if (waiting.said)
    return new Response(
      `${pageHead(language, said('tent.ask.done'))}\n<body><main><p>${said('tent.ask.done')}</p></main></body></html>`,
      {
        status: 200,
        headers: lines,
      },
    )
  const answer = madeText(o, 'ask', { a: text, user: waiting.user })
  const own = Object.entries(o.description.screens).find(([, one]) => one.for === 'ask')?.[0]
  if (!own) {
    const fields: unknown = Reflect.get(Object(o.description.functions[waiting.name]), 'input')
    const html = [
      pageHead(language, said('tent.ask.title', { tool: title })),
      '<body><main>',
      `<h1>${said('tent.ask.title', { tool: title })}</h1>`,
      `<ul>${inputLines(fields, waiting.input)
        .map((one) => `<li>${asText(one)}</li>`)
        .join('')}</ul>`,
      ...listedHtml(o, waiting, titleOf, inputLines, said),
      '<form method="post" action="/_t/ask">',
      `<input type="hidden" name="t" value="${asText(answer)}">`,
      `<button type="submit" name="answer" value="allow">${said('tent.ask.allow')}</button>`,
      `<button type="submit" name="answer" value="refuse">${said('tent.ask.refuse')}</button>`,
      '</form></main></body></html>',
    ].join('\n')
    return new Response(html, { status: 200, headers: lines })
  }
  const press = (said: string) => ({
    definition: `tent.ask.${said}`,
    kind: 'post' as const,
    post: '/_t/ask',
    form: { t: answer, answer: said },
  })
  const ask = {
    title,
    tool: waiting.name,
    input: shownInput(o, waiting.name, waiting.input),
    ...(waiting.sequence
      ? {
          sequence: waiting.sequence.map((one) => ({ ...one, input: shownInput(o, String(one.tool), one.input) })),
          more: waiting.more === true,
        }
      : {}),
    allow: press('allow'),
    refuse: press('refuse'),
  }
  const { pageAnswer } = await import('../pages/answer.ts')
  const page = await pageAnswer(
    o,
    new URL(request.url),
    origin,
    caller,
    undefined,
    false,
    request.headers.get('cookie'),
    {
      screen: { name: own, handed: { ask } },
    },
  )
  return unframed(page)
}

/** How long the text of the page of an ask works. */
export const askLife = (o: Opened): number => storedLimit(o.description, 'askTime')
