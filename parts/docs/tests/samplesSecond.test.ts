import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findPage } from '../index.ts'

// What the builders of the sample apps found missing from the pages in their second pass, each held where they looked.

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

test('[03-5] the pages say what the second pass of sample app 1 looked for: where the loading component stands, and a link that a library draws as pressed', () => {
  says([
    ['option.screen.loading', /inside its `layout`/],
    ['option.screen.loading', /`loadingAfter`/],
    ['tag.Link', /as pressed[^.]*`exact`/],
  ])
})

test('[03-5] the pages say what the second pass of sample app 2 looked for: the other languages of a page, the three browsers of a driver, and what a count of a minute is kept by', () => {
  says([
    ['option.screen.seo', /<link rel="alternate" hreflang=/],
    ['option.project.languages', /hreflang/],
    ['topic.tests.driver', /npx playwright install chromium firefox webkit/],
  ])
  const counts = sectionOf('topic.engine.counts', 'The counts of a minute')
  assert.match(counts, /minute of the clock/)
  assert.match(counts, /`127\.0\.0\.1`/)
})

test('[03-5] the pages say what the second pass of sample app 3 looked for: the body of a call coming in, faked models over a port, a picture while the page moves, and a microphone beside Chromium', () => {
  says([
    ['word.incoming', /event\?\.body/],
    ['word.incoming', /`json\(\)`/],
    ['topic.tests.driver', /media\.navigator\.streams\.fake/],
    ['topic.tests.driver', /reducedMotion/],
    ['topic.tests.driver', /as the page stands/],
  ])
  assert.match(sectionOf('topic.tests.driver', 'A driver of your own'), /`makers\.providers`/)
})

test('[03-5] the pages say what the second pass of sample app 4 looked for: whose request a program holds, where the pointed place stands, what an undo leaves of the conversation, and how a program of your own is started', () => {
  says([
    ['topic.workspaces', /`app\.caller\(request\)`/],
    ['topic.engine.web', /`app\.caller\(request\)`/],
    ['code.T7007', /The person points at the tag/],
    ['topic.workspaces.turn', /The person points at the tag/],
    ['topic.workspaces.turn', /memory table[^.]*stay/],
    ['topic.engine', /`node server\.ts`/],
  ])
})

test('[03-5] the pages say what the second pass of the docs site looked for: how a search ranks, what a proxy is taken as, what is counted behind one, the state a component reads, and a move from code', () => {
  says([
    ['option.table.search', /bm25/],
    ['option.table.search', /every column weighs the same/],
    ['command.start', /`scheme=https`/],
    ['code.T0005', /`screensPerMinute`/],
    ['code.T0005', /`X-Forwarded-For`/],
    ['command.export', /`X-Forwarded-For`/],
    ['option.project.state', /set\(\{ mode/],
    ['hook.useGoTo', /moves inside the page/],
  ])
  assert.doesNotMatch(pageOf('hook.useGoTo'), /loaded as a whole page/)
})

test('[03-5] the pages say what the builder of the engine of sample app 5 looked for: what a driver is handed, whose call it makes, what it keeps of the agent, what a page shows of it, a limit a person sets, and the names a definition may not take', () => {
  says([
    ['adapter.Driver', /`waitFor`/],
    ['adapter.Driver', /`used\(/],
    ['adapter.Driver', /`allow\(/],
    ['adapter.Driver', /as the starter of the run/],
    ['adapter.Driver', /`run\.record`/],
    ['option.agent.questions', /`adapter\.Driver`/],
    ['option.agent.memory', /`adapter\.Driver`/],
    ['hook.useAgent', /env\.tell\(/],
    ['option.model.limits', /`shows: 'counts'`/],
    ['word.project', /`code\.T1004`/],
    ['word.service', /`code\.T1009`/],
    ['topic.words', /`mail`, `files`/],
  ])
})
