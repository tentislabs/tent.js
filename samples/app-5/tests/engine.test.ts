import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { testApp } from 'tentjs/test'

// Claude Code is the test's own stand-in, which answers in Claude Code's streamed form.
process.env.BOTS_CLAUDE = JSON.stringify([process.execPath, join(import.meta.dirname, '..', 'fakes', 'claude.ts')])

const open = async () => {
  const app = await testApp()
  const sam = (await app.rows('users')).find((one) => one.email === 'sam@example.com')
  assert.ok(sam)
  const bots = await app.rows('bots')
  const chief = bots.find((one) => one.kind === 'chief')
  const calendarBot = bots.find((one) => one.name === 'Calendar')
  assert.ok(chief && calendarBot)
  return { app, sam: sam.id, chief: chief.id, calendarBot: calendarBot.id }
}

// A turn that outlasts the wait of a call goes on as a run, so the answer is then read from the bot's runs.
const say = async (
  app: Awaited<ReturnType<typeof testApp>>,
  who: string,
  agent: 'bot' | 'chief',
  thread: string,
  message: string,
) => {
  try {
    return String(Object(await app.as(who).call(agent, { message, thread })).text)
  } catch (error) {
    if (Object(error).code !== 'T0008') throw error
    await app.settled()
    return String((await app.as(who).call('runList', { bot: thread }))[0].answer)
  }
}

const waitingAsks = async (app: Awaited<ReturnType<typeof testApp>>) =>
  (await app.rows('asks')).filter((one) => one.state === 'waiting')

test('a new bot greets its person and asks what to focus on first, and then answers as it arrives', async () => {
  const { app, sam } = await open()
  const inbox = Object(await app.as(sam).call('addBot', { name: 'Inbox', brief: '' })).id
  await app.settled()
  const [ask] = await waitingAsks(app)
  assert.ok(ask, 'the greeting waits for an answer')
  assert.equal(ask.kind, 'question')
  assert.equal(ask.question, 'What should I focus on first?')
  assert.equal(ask.choices.length, 4)
  const greeting = (await app.as(sam).call('talkOf', { bot: inbox })).at(-1)
  assert.match(String(greeting?.text), /^Hi Sam, I'm Inbox\./)
  await app.as(sam).call('answerAsk', { ask: ask.id, yes: true, answer: ask.choices[0] })
  await app.settled()
  const bot = (await app.rows('bots')).find((one) => one.id === inbox)
  assert.match(String(bot?.brief), /Sorting what comes in/)
  const asked = await say(app, sam, 'bot', inbox, 'What is on today?')
  assert.match(asked, /written in three parts/)
  const runs = await app.as(sam).call('runList', { bot: inbox })
  assert.equal(runs[0].state, 'done')
  assert.equal(runs[0].by, 'person')
  assert.deepEqual(
    (await app.as(sam).call('talkOf', { bot: inbox })).map((one) => one.who),
    ['assistant', 'user', 'assistant', 'user', 'assistant'],
  )
  await app.close()
})

test('a routine every morning at eight starts its bot with no person asking', async () => {
  const { app, sam, calendarBot } = await open()
  const routine = Object(
    await app.as(sam).call('addRoutine', { bot: calendarBot, every: 'every morning at eight', task: 'Plan my day.' }),
  )
  assert.equal(new Date(routine.next).getUTCHours(), 8)
  const hours = (new Date(routine.next).getTime() - Date.now()) / 3600000
  app.clock.advance(`${Math.ceil(hours * 60) + 2} minutes`)
  await app.settled()
  const runs = await app.as(sam).call('runList', { bot: calendarBot })
  assert.equal(runs.length, 1)
  assert.equal(runs[0].by, 'routine')
  assert.equal(runs[0].task, 'Plan my day.')
  const moved = (await app.rows('routines'))[0]
  assert.ok(new Date(String(moved.next)).getTime() > new Date(routine.next).getTime())
  await app.close()
})

test('the chief hands the summary to Inbox and the call to Calendar, which asks before it sends', async () => {
  const { app, sam, chief, calendarBot } = await open()
  const sent = app.fake('calendar', { createEvent: () => ({ id: 'e1', sent: true }) })
  app.fake('mailbox', { searchMail: () => ({ mails: [{ from: 'ada@example.com', subject: 'A call?' }] }) })
  const inbox = Object(
    await app.as(sam).call('addBot', { name: 'Inbox', brief: 'Reads and sorts my mail.', greet: false }),
  ).id
  const told = await say(app, sam, 'chief', chief, 'Summarise my mail and book a call with Ada')
  assert.match(told, /Inbox/)
  await app.settled()
  const chiefRun = (await app.as(sam).call('runList', { bot: chief }))[0]
  const under = await app.as(sam).call('runsUnder', { run: chiefRun.run })
  assert.deepEqual(under.map((one) => Object(one.bot).name).sort(), ['Calendar', 'Inbox'])
  assert.match(String((await app.as(sam).call('runList', { bot: inbox }))[0].answer), /Ada asks for a call/)
  const [ask] = await waitingAsks(app)
  assert.equal(ask.kind, 'permission')
  assert.equal(ask.tool, 'sendInvite')
  assert.equal(ask.bot, calendarBot)
  assert.equal(sent.sent.length, 0, 'nothing is sent before Yes')
  await app.as(sam).call('answerAsk', { ask: ask.id, yes: true })
  await app.settled()
  assert.deepEqual(
    sent.sent.map((one) => one.call),
    ['createEvent'],
  )
  assert.equal((await app.rows('asks')).find((one) => one.id === ask.id)?.state, 'yes')
  await app.close()
})

test('No sends nothing', async () => {
  const { app, sam, calendarBot } = await open()
  const sent = app.fake('calendar', { createEvent: () => ({ id: 'e1' }) })
  app.as(sam).call('bot', { message: 'Book a call with Ada', thread: calendarBot })
  await app.settled()
  const [ask] = await waitingAsks(app)
  await app.as(sam).call('answerAsk', { ask: ask.id, yes: false })
  await app.settled()
  assert.equal(sent.sent.length, 0)
  const run = (await app.as(sam).call('runList', { bot: calendarBot }))[0]
  assert.equal(run.state, 'done')
  assert.match(String(run.answer), /nothing went out/)
  await app.close()
})

test('a bot answers from its own memory the next day, and holds nothing of another bot', async () => {
  const { app, sam, calendarBot } = await open()
  app.fake('mailbox', { searchMail: () => ({ mails: [] }) })
  const inbox = Object(await app.as(sam).call('addBot', { name: 'Inbox', brief: 'My mail.', greet: false })).id
  await say(app, sam, 'bot', inbox, 'Summarise my mail')
  await say(app, sam, 'bot', calendarBot, 'Plan the week of calls')
  app.clock.advance('1 day')
  const answer = await say(app, sam, 'bot', inbox, 'What did you do yesterday?')
  assert.match(answer, /Summarise my mail/)
  assert.doesNotMatch(answer, /Plan the week/)
  await app.close()
})

test('a low day limit refuses the run with its code, and the use of the day is shown', async () => {
  const { app, sam, calendarBot } = await open()
  await say(app, sam, 'bot', calendarBot, 'Hello')
  const used = await app.as(sam).call('usedToday', {})
  assert.equal(used.tokensOut, 300)
  await app.as(sam).call('changePreferences', { dayLimit: 100 })
  await assert.rejects(app.as(sam).call('bot', { message: 'Once more', thread: calendarBot }), { code: 'day-limit' })
  const runs = await app.as(sam).call('runList', { bot: calendarBot })
  assert.equal(runs[0].state, 'failed')
  assert.equal(Object(runs[0].error).code, 'day-limit')
  assert.equal((await app.as(sam).call('usedToday', {})).limit, 100)
  await app.close()
})
