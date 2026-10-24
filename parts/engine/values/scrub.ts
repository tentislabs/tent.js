// A value of fewer characters is not looked for: it would be found inside ordinary words.
const shortest = 8

const marked = '[secret]'

/** The standard base64 of a text, with and without its filling, and the form that is safe in an address. */
function inBase64(value: string): string[] {
  const bytes = Buffer.from(value, 'utf8')
  const standard = bytes.toString('base64')
  return [standard, standard.replace(/=+$/, ''), bytes.toString('base64url')]
}

/** The user name and the password of a value that is an address, each as it is written and as it reads. */
function partsOfAddress(value: string): string[] {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return []
  }
  const parts: string[] = []
  for (const part of [url.username, url.password]) {
    if (part === '') continue
    parts.push(part)
    try {
      parts.push(decodeURIComponent(part))
    } catch {
      // A part that is no percent text is looked for as it is written alone.
    }
  }
  return parts
}

/**
 * Takes the values that an engine holds. Answers every text that one of them may be written as: itself, written
 * with percent signs, inside a text of JSON, in base64, and for a value that is an address its user name and its
 * password by themselves, since a mail server echoes those and not the address. The longest stand first, so that a value is
 * taken out whole before a part of it is.
 */
export function formsOf(values: string[]): string[] {
  const forms = new Set<string>()
  for (const value of values) {
    if (value.length < shortest) continue
    for (const one of [value, ...partsOfAddress(value)]) {
      if (one.length < shortest) continue
      forms.add(one)
      forms.add(encodeURIComponent(one))
      // Inside a text of JSON a quote and a backslash are written with a backslash, once for each JSON around it.
      const escaped = JSON.stringify(one).slice(1, -1)
      forms.add(escaped)
      forms.add(JSON.stringify(escaped).slice(1, -1))
      for (const written of inBase64(one)) forms.add(written)
    }
  }
  return [...forms].filter((form) => form.length >= shortest).sort((a, b) => b.length - a.length)
}

/** Answers a text with every form of a held value replaced by `[secret]`. */
export function scrubbed(text: string, forms: string[]): string {
  let clean = text
  for (const form of forms) if (clean.includes(form)) clean = clean.split(form).join(marked)
  return clean
}
