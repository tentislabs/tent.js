// The shape of a page of the docs, by its kind: its title, its lead, its headings, and the thing its example shows.

const word = (name) => `\`${name}\``
// For each kind: the title of a page with a name, its sections in their order, those that are always there, and the
// section that shows the thing with what must stand in it. A kind with no list of sections has headings of its own.
const kinds = {
  word: {
    title: (name) => `# ${word(name)}`,
    sections: ['Example', 'Options', 'Returns', 'Errors', 'See also'],
    needed: ['Example'],
    shows: (name) => ['Example', name],
  },
  option: {
    title: (name) => `# ${word(name.slice(name.indexOf('.') + 1))} of ${word(name.slice(0, name.indexOf('.')))}`,
    sections: ['Value', 'Example', 'Errors', 'See also'],
    needed: ['Value', 'Example'],
    shows: (name) => ['Example', name.slice(name.indexOf('.') + 1)],
  },
  tag: {
    title: (name) => `# ${word(name)}`,
    sections: ['Example', 'Properties', 'Errors', 'See also'],
    needed: ['Example'],
    shows: (name) => ['Example', `<${name}`],
  },
  hook: {
    title: (name) => `# ${word(name)}`,
    sections: ['Example', 'Takes', 'Returns', 'Errors', 'See also'],
    needed: ['Example'],
    shows: (name) => ['Example', name],
  },
  handle: {
    title: (name) => `# ${word(name)}`,
    sections: ['Example', 'Members', 'Errors', 'See also'],
    needed: ['Example'],
    shows: (name) => ['Example', name],
  },
  command: {
    title: (name) => `# ${word(`tent ${name}`)}`,
    sections: ['Usage', 'Options', 'Example', 'Output', 'Errors', 'See also'],
    needed: ['Usage'],
    shows: (name) => ['Usage', `tent ${name}`],
  },
  code: {
    title: (name) => new RegExp(`^# ${name} [a-z0-9]+(?:-[a-z0-9]+)*$`),
    says: (name) => `# ${name} <its name>`,
    sections: ['Details', 'The fix', 'See also'],
    needed: ['The fix'],
  },
  adapter: {
    title: (name) => `# ${word(name)}`,
    sections: ['Interface', 'Example', 'See also'],
    needed: ['Interface', 'Example'],
    shows: (name) => ['Example', name],
  },
  topic: {
    title: () => /^# \S/,
    says: () => '# <its title in plain words>',
  },
}

/** Says what stands at a line where the lead of a page should stand, or nothing where the line starts a paragraph. */
function noParagraph(line) {
  if (line === undefined) return 'nothing'
  if (/^#/.test(line)) return 'a heading'
  if (/^\|/.test(line)) return 'a table'
  if (/^(?:[-*+]|\d+[.)])\s/.test(line)) return 'a list'
  if (/^(?:```|~~~)/.test(line)) return 'a code block'
  return undefined
}

/** Cuts the lines under the title into the sections of a page: each with its heading, its lines, and its code blocks. */
function sectionsOf(lines) {
  const sections = []
  let fence
  for (const line of lines) {
    const mark = /^(```|~~~)/.exec(line)?.[1]
    const at = sections.at(-1)
    if (fence) {
      if (mark === fence) fence = undefined
      else at?.code.push(line)
    } else if (mark) fence = mark
    else if (line.startsWith('## ')) sections.push({ heading: line.slice(3).trim(), code: [], blocks: 0 })
    if (mark && fence && at) at.blocks++
  }
  return sections
}

/**
 * Takes the kind of a page, its name without the kind, and its text. Answers what is wrong with the shape of the
 * page, each as words of its own, and nothing for a page that has the shape of its kind or is of no kind.
 */
export function wrongShape(kind, name, text) {
  const shape = kinds[kind]
  if (!shape) return []
  const wrong = []
  const [first, ...rest] = text.replace(/\r\n/g, '\n').split('\n')
  const title = shape.title(name)
  if (title instanceof RegExp ? !title.test(first) : first !== title)
    wrong.push(`its first line is not the title of its kind, which is: ${shape.says?.(name) ?? title}`)

  const stands = noParagraph(rest.find((line) => line.trim() !== ''))
  if (stands) wrong.push(`no lead stands under its title: ${stands} stands there`)

  const sections = sectionsOf(rest)
  if (shape.sections) {
    const order = `${shape.sections.join(', ')}`
    let last = -1
    for (const { heading } of sections) {
      const place = shape.sections.indexOf(heading)
      if (place < 0) wrong.push(`the heading "${heading}" is none of its kind, which has: ${order}`)
      else if (place <= last)
        wrong.push(
          `the heading "${heading}" stands after "${shape.sections[last]}", and the order of its kind is: ${order}`,
        )
      last = Math.max(last, place)
    }
    for (const needed of shape.needed)
      if (!sections.some(({ heading }) => heading === needed))
        wrong.push(`the section "${needed}" is not there, which a page of its kind always has`)
  }

  const [where, thing] = shape.shows?.(name) ?? []
  const shown = sections.find(({ heading }) => heading === where)
  if (shown) {
    // The thing stands as a word of its own: `table` is not shown by `tables`.
    const whole = new RegExp(`(?<![\\w$])${thing.replace(/[.*+?^${}()|[\]\\<]/g, '\\$&')}(?![\\w$])`)
    if (!shown.blocks) wrong.push(`its section "${where}" holds no code block`)
    else if (!whole.test(shown.code.join('\n')))
      wrong.push(
        `its ${where === 'Example' ? 'example' : `section "${where}"`} does not show its thing: ${word(thing)}`,
      )
  }
  return wrong
}
