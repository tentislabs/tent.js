import assert from 'node:assert/strict'
import test from 'node:test'
import { answered, handing, lateOrders, lines, rowsOf, sequencedApp, stepsOf, waiting } from './sequencing.ts'
import { notDropped } from './started.ts'

/** What an ask of a sequence shows: the waiting call, the list of the walk, and whether more may follow. */
interface AskShown {
  tool?: string
  input?: unknown
  sequence?: { step: string; tool: string; input: unknown; asks: boolean; agreed?: boolean }[]
  more?: boolean
}

const shownOf = (show: unknown): AskShown => Object(show)

test('[27-18] over three late orders the sequence waits once for the three refunds, with more true, and one yes runs all three under agreed; where mailReceipt asks, each mail is asked about in its turn', async (t) => {
  const { app, maya, orders } = await sequencedApp(t)
  app.fake('writer', handing(lateOrders))
  const { run } = notDropped(await app.start('asking', { message: 'Refund.' }, { as: maya }))
  const first = await waiting(app, run)
  assert.equal(first?.name, 'ask 1.1.2')
  const shown = shownOf(first?.show)
  assert.equal(shown.tool, 'refund')
  assert.deepEqual(shown.input, { order: orders[1] })
  assert.deepEqual(
    shown.sequence?.map((one) => [one.step, one.tool, one.input, one.asks]),
    [
      ['tool 1.1.2 refund', 'refund', { order: orders[1] }, true],
      ['tool 1.1.4 refund', 'refund', { order: orders[2] }, true],
      ['tool 1.1.6 refund', 'refund', { order: orders[3] }, true],
    ],
  )
  assert.equal(shown.more, true)
  // The page's ask holds the list and more, as working gives it.
  const working: unknown = await app.as(maya).call('asking.working', {})
  const [ask] = Reflect.get(Object(Array.isArray(working) ? working[0] : undefined), 'asks') ?? []
  assert.equal(Reflect.get(Object(ask), 'sequence')?.length, 3, JSON.stringify(working))
  assert.equal(Reflect.get(Object(ask), 'more'), true)
  app.runs.approve(run, 'ask 1.1.2')
  const asked = ['ask 1.1.2']
  for (const mail of ['ask 1.1.3', 'ask 1.1.5', 'ask 1.1.7']) {
    const next = await waiting(app, run, asked)
    assert.equal(next?.name, mail)
    assert.equal(shownOf(next?.show).tool, 'mailReceipt')
    app.runs.approve(run, mail)
    asked.push(mail)
  }
  assert.equal(await answered(app, run), 'Done: {"refunded":3}')
  const names = stepsOf(app, run).map((one) => one.name)
  assert.deepEqual(
    names.filter((one) => one.startsWith('ask ')),
    asked,
  )
  assert.equal(await rowsOf(app, maya, 'allRefunds'), 3)
})

test('[27-18] a sequence that makes the three refunds and then the three mails waits twice; an ask lists a read that comes with asks false; and a sequence with no choice and no call passed over has more false', async (t) => {
  const { app, maya, orders } = await sequencedApp(t)
  app.fake(
    'writer',
    handing(
      lines(
        'const late = where(myOrders({}), { total: { above: 100 } })',
        'const rs = each(late, (o) => refund({ order: o.id }))',
        'each(late, (o, i) => mailReceipt({ order: o.id, refund: rs[i].refund }))',
        'return rs.length',
      ),
    ),
  )
  const { run } = notDropped(await app.start('asking', { message: 'Refund.' }, { as: maya }))
  const refunds = await waiting(app, run)
  assert.equal(refunds?.name, 'ask 1.1.2')
  assert.equal(shownOf(refunds?.show).sequence?.length, 3)
  assert.equal(shownOf(refunds?.show).more, true)
  app.runs.approve(run, 'ask 1.1.2')
  const mails = await waiting(app, run, ['ask 1.1.2'])
  assert.equal(mails?.name, 'ask 1.1.5')
  assert.deepEqual(
    shownOf(mails?.show).sequence?.map((one) => one.step),
    ['tool 1.1.5 mailReceipt', 'tool 1.1.6 mailReceipt', 'tool 1.1.7 mailReceipt'],
  )
  assert.equal(shownOf(mails?.show).more, false)
  app.runs.approve(run, 'ask 1.1.5')
  assert.equal(await answered(app, run), 'Done: 3')
  assert.equal(stepsOf(app, run).filter((one) => one.name.startsWith('ask ')).length, 2)
  app.fake(
    'writer',
    handing(lines(`const r = refund({ order: '${orders[0]}' })`, 'const open = myOrders({})', 'return open.length')),
  )
  const read = notDropped(await app.start('helper', { message: 'Refund one.' }, { as: maya }))
  const listed = await waiting(app, read.run)
  assert.deepEqual(
    shownOf(listed?.show).sequence?.map((one) => [one.step, one.asks]),
    [
      ['tool 1.1.1 refund', true],
      ['tool 1.1.2 myOrders', false],
    ],
  )
  assert.equal(shownOf(listed?.show).more, false)
  app.runs.approve(read.run, String(listed?.name))
  assert.equal(await answered(app, read.run), 'Done: 4')
})

test('[27-18] a choice whose test is not known ends the walk with more true, and before an all whose entries ask the sequence waits once for all of them', async (t) => {
  const { app, maya, orders } = await sequencedApp(t)
  app.fake(
    'writer',
    handing(
      lines(
        `const r = refund({ order: '${orders[0]}' })`,
        'if (r.refund) {',
        `  markLate({ order: '${orders[0]}' })`,
        '}',
        'return 1',
      ),
    ),
  )
  const chosen = notDropped(await app.start('helper', { message: 'Go.' }, { as: maya }))
  const ask = await waiting(app, chosen.run)
  assert.equal(shownOf(ask?.show).more, true)
  assert.equal(shownOf(ask?.show).sequence?.length, 1)
  app.runs.approve(chosen.run, String(ask?.name))
  assert.equal(await answered(app, chosen.run), 'Done: 1')
  app.fake(
    'writer',
    handing(
      lines(
        'const open = myOrders({})',
        'return all(where(open, { total: { above: 100 } }), (o) => refund({ order: o.id }))',
      ),
    ),
  )
  const together = notDropped(await app.start('helper', { message: 'Refund.' }, { as: maya }))
  const once = await waiting(app, together.run)
  assert.equal(once?.name, 'ask 1.1.2')
  assert.deepEqual(
    shownOf(once?.show).sequence?.map((one) => one.step),
    ['tool 1.1.2.1.1 refund', 'tool 1.1.2.2.1 refund', 'tool 1.1.2.3.1 refund'],
  )
  app.runs.approve(together.run, 'ask 1.1.2')
  assert.match(await answered(app, together.run), /^Done: \[\{"refund":/)
  assert.equal(stepsOf(app, together.run).filter((one) => one.name.startsWith('ask ')).length, 1)
})

test('[27-18] a no ends the sequence with T7111 and the words of a refusal, and the calls before it stay made; a walk that lists more calls than are left of toolCalls ends the sequence with T7102 before any of them', async (t) => {
  const { app, maya } = await sequencedApp(t)
  app.fake('writer', handing(lateOrders))
  const refused = notDropped(await app.start('asking', { message: 'Refund.' }, { as: maya }))
  const ask = await waiting(app, refused.run)
  app.runs.refuse(refused.run, String(ask?.name))
  const told = JSON.parse((await answered(app, refused.run)).slice('Done: '.length))
  assert.match(String(told), /^The person refused this\..*line 4/s)
  assert.match(String(told), /"tool":"myOrders"/)
  assert.equal(await rowsOf(app, maya, 'allRefunds'), 0)
  const tight = notDropped(await app.start('tight', { message: 'Refund.' }, { as: maya }))
  const past = JSON.parse((await answered(app, tight.run)).slice('Done: '.length))
  assert.match(String(past), /^Error T7102: .*4/s)
  assert.match(String(past), /"tool":"myOrders"/)
  assert.ok(!stepsOf(app, tight.run).some((one) => one.name.startsWith('ask ')), 'nobody was asked')
  assert.equal(await rowsOf(app, maya, 'allRefunds'), 0)
})
