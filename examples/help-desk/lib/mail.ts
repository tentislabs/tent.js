/** A mail as the mail service sends it to the hook of the support address. */
export type Mail = { from: string; name?: string; subject: string; text: string }

function textAt(value: object, name: string): string | undefined {
  const found = Object.entries(value).find(([key]) => key === name)?.[1]
  return typeof found === 'string' ? found : undefined
}

/** Reads the mail out of the body of a call of the hook, or nothing where it holds none. */
export function readMail(body: unknown): Mail | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const from = textAt(body, 'from')
  const subject = textAt(body, 'subject')
  const text = textAt(body, 'text')
  if (!from || !subject || text === undefined) return undefined
  const name = textAt(body, 'name')
  return name ? { from, name, subject, text } : { from, subject, text }
}
