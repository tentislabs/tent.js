import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findPage } from '../index.ts'

// What the builders of the sample apps found missing from the pages, each held where they looked for it.

/** The text of a page, which must be there. */
function pageOf(name: string): string {
  const page = findPage(name)
  assert.ok(page, `the page ${name} is there`)
  return page.text
}

/**
 * The section of a page under its `## ` heading, or from the top of a page whose title the heading is, with no
 * heading of its own after it.
 */
function sectionOf(name: string, heading: string): string {
  const text = pageOf(name)
  const start = text.startsWith(`# ${heading}\n`) ? 0 : text.indexOf(`\n## ${heading}\n`)
  assert.ok(start >= 0, `${name} has the section ${heading}`)
  const end = text.indexOf('\n## ', start + 1)
  return text.slice(start, end < 0 ? undefined : end)
}

/** Holds that each page says each thing it is asked to say. */
function says(said: [string, RegExp][]): void {
  const missing = said.filter(([name, words]) => !words.test(pageOf(name))).map(([name, words]) => `${name} ${words}`)
  assert.deepEqual(missing, [])
}

test('[03-5] the pages say what the builder of sample app 1 looked for: a step back, set, the type of a path, the output of a query, the settings of the type checker, a field of money, the end of tent dev', () => {
  says([
    ['tag.Link', /popstate/],
    ['tag.Link', /`\/\$\{string\}`/],
    ['tag.Form', /`\/\$\{string\}`/],
    ['word.screen', /`set` takes/],
    ['option.query.run', /`code\.T0009`/],
    ['option.query.run', /output: object\(/],
    ['topic.build', /`tsconfig\.json`/],
    ['topic.build', /`walk\/`/],
    ['hook.useField', /cents/],
    ['hook.useField', /field\.set\(/],
    ['command.dev', /0 takes a free one/],
    ['command.dev', /`command\.start`/],
  ])
})

test('[03-5] the pages say what the builder of sample app 2 looked for: data above the arrows over it, set, what a sitemap is counted by, a move in a view transition, how long a state of the device lasts, the browser of a driver of its own', () => {
  says([
    ['option.screen.title', /after `data`/],
    ['option.screen.seo', /after `data`/],
    ['option.screen.view', /set\(\{ tab: 'paid' \}\)/],
    ['option.screen.state', /a year/],
    ['topic.look.motion', /startViewTransition/],
    ['topic.tests.driver', /playwright install/],
  ])
  const counts = sectionOf('topic.engine.counts', 'The counts of a minute')
  assert.match(counts, /`\/sitemap\.xml`/)
  assert.match(counts, /`\/_t\/health`/)
})

test('[03-5] the pages say what the builder of sample app 3 looked for: a faked model, a key at the command line, a whole memory table, an answer as it arrives, what was heard, a browser of its own, which files are tests', () => {
  says([
    ['topic.tests.model', /^# A faked model\n/],
    ['topic.tests.model', /calls: \[\{ tool: '\w+', with:/],
    ['topic.tests.model', /as one part/],
    ['topic.tests.model', /fail: 'server'/],
    ['topic.tests.services', /Authorization: Bearer/],
    ['topic.tests.driver', /--port 0/],
    ['topic.tests.driver', /use-file-for-fake-audio-capture/],
    ['topic.tests', /every `\.ts` and `\.tsx` file under `tests\/`/],
    ['topic.tests', /a flow[^.]*`unknown`/],
    ['adapter.Provider', /`fail`/],
    ['code.T7007', /owner: 'by'/],
    ['hook.useAgent', /`who: 'user'`/],
  ])
})

test('[03-5] the pages say what the builder of sample app 4 looked for: a model faked in a program, the person of a workspace, a name with its port, live, working, the rows of a memory, the commands of a box, an undo that a table change refuses, and how packages are installed', () => {
  says([
    ['topic.workspaces', /providers: \(\) =>/],
    ['topic.workspaces', /`tent_`/],
    ['topic.workspaces.turn', /`code\.T2003`/],
    ['topic.engine.web', /with its port/],
    ['handle.workspaces', /`\{ version, address \}`/],
    ['word.agent', /helper\.working/],
    ['code.T7007', /`\{ calls: \[\{ id, tool, input \}\] \}`/],
    ['adapter.Sandbox', /`tent check --json`/],
    ['topic.look', /`npm ci /],
  ])
})

test('[03-5] the pages say what the builder of the docs site looked for: how a program reads the pages, the folder the code of an app runs in, and the other case of T0006', () => {
  says([
    ['command.docs', /`pages\/`/],
    ['command.docs', /`llms\.txt`/],
    ['word.seed', /working folder/],
    ['command.start', /working folder/],
    ['code.T0006', /for whoever started it/],
  ])
})

test('[03-5] the pages say what the first builder of the docs site looked for: a package of fonts of fixed weights, a style file for each weight, and its family by its plain name', () => {
  const fonts = sectionOf('topic.look.fonts', 'Fonts')
  assert.match(fonts, /`@fontsource-variable\/inter`/)
  assert.match(fonts, /import '@fontsource\/inter\/700\.css'/)
  assert.match(fonts, /font-family: "Inter",/)
})

test('[03-5] the page of the look gives one way end to end: Tailwind CSS by its plugin, daisyUI, Recharts, light and dark, one scale of type and of spacing, each state of a screen, what draws where, and how the packages are installed', () => {
  const recipe = sectionOf('topic.look', 'One look, end to end')
  for (const [what, words] of [
    ['the packages, each by tent add', /tent add tailwindcss[\s\S]*tent add daisyui[\s\S]*tent add recharts/],
    ['how a copy installs them', /`npm ci --ignore-scripts`/],
    ['the plugin of Tailwind CSS', /plugins: \[tailwindcss\(\)\]/],
    ['daisyUI in the style file', /@plugin "daisyui";/],
    ['light and dark in one place', /dark/],
    ['one type scale and one spacing scale', /type scale[\s\S]*spacing scale/],
    ['the layout that imports the style file', /layout: AppFrame/],
    ['the chart', /<BarChart/],
    ['the empty state', /\| Empty \|/],
    ['the loading state', /\| Loading \|/],
    ['the error state', /\| Error \|/],
    ['the focus state', /\| Focus \|/],
    ['the hover state', /\| Hover \|/],
    ['what is in no first HTML', /in the browser alone: the first HTML holds its empty box/],
  ] as const)
    assert.match(recipe, words, `the recipe holds ${what}`)
})

test('[03-5] the page of the data and the way out says that the data is SQLite files, the pages React, the ways out, and what is written in the framework words, and the first page names it', () => {
  const page = pageOf('topic.leaving')
  for (const [what, words] of [
    ['the data as SQLite files of the data folder', /`data\.db`[\s\S]*SQLite/],
    ['a tool that opens them', /`sqlite3`/],
    ['how a row is kept', /milliseconds since 1970/],
    ['the pages as React', /## The pages are React/],
    ['the rows', /`tent data rows <table>`/],
    ['a backup', /`tent data backup`/],
    ['the public pages', /`tent export`/],
    ['the history to git', /`tent history export/],
    ['what is written in the framework words', /## What is written in the framework's words/],
  ] as const)
    assert.match(page, words, `the page says ${what}`)
  assert.doesNotMatch(page, /\b(?:cannot|can't|can not)\b/, 'the page says the facts and the way forward')
  assert.match(pageOf('topic.start.dev'), /`topic\.leaving`/)
})

test('[03-5] the pages say what the newcomer of the trial of the first part looked for: a search in the address, every row while no words are given, words and pieces, the id of a user, a word in place of a flag, pages in a screen', () => {
  says([
    ['topic.screens.lists', /^# A list with a search and pages\n/],
    ['topic.screens.lists', /set\(\{ words: /],
    ['topic.screens.lists', /after: undefined/],
    ['topic.plans', /An empty text finds every row/],
    ['code.T1014', /search\(given\(/],
    ['option.table.search', /three characters/],
    ['topic.users', /tent data rows users/],
    ['topic.users', /tent cli/],
    ['topic.commands', /`tent new --name my-app`/],
  ])
})
