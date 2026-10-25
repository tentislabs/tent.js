// The chief routes: Claude Code answers which bot takes which task, and each task starts a run of that bot under the
// chief's run, which goes on by itself while the chief tells the person what it handed to whom.
import type { DriverSteps } from 'tentjs/flows'
import type { Turn } from './claude.ts'
import { type BotInfo, record } from './read.ts'

export const routingShape = {
  type: 'object',
  properties: {
    say: { type: 'string', description: 'One or two lines to the person: what you handed to whom, or what you ask' },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          bot: { type: 'string', description: 'The name of the bot, exactly as the list writes it' },
          task: { type: 'string', description: 'What that bot is to do, in the words of a request to it' },
        },
        required: ['bot', 'task'],
      },
    },
  },
  required: ['say', 'tasks'],
}

export const routing = (info: BotInfo, message: string): string =>
  [
    'The bots, each with its brief:',
    ...info.others.map((one) => `- ${one.name}: ${one.brief || '(no brief yet)'}`),
    '',
    `${info.person.name || 'The person'} asks: ${message}`,
    '',
    'Hand each part of it to the bot whose brief fits. Where none fits, hand nothing, and ask in `say`.',
  ].join('\n')

export const handOn = async (o: {
  turn: Turn
  info: BotInfo
  run: string
  step: DriverSteps
  call: (name: string, args: unknown) => Promise<unknown>
}): Promise<string> => {
  const routed = record(o.turn.structured)
  const tasks = Array.isArray(routed.tasks) ? routed.tasks.map(record) : []
  const handed: { bot: string; name: string; task: string; run: string }[] = []
  for (const [i, task] of tasks.entries()) {
    const name = String(task.bot ?? '').trim()
    const to = o.info.others.find((one) => one.name.toLowerCase() === name.toLowerCase())
    if (!to || typeof task.task !== 'string') continue
    const started = record(
      await o.step(`hand ${i + 1}`, () => o.call('handTask', { bot: to.id, task: task.task, under: o.run })),
    )
    handed.push({ bot: to.id, name: to.name, task: String(task.task), run: String(started.run ?? '') })
  }
  const say =
    typeof routed.say === 'string' && routed.say
      ? routed.say
      : handed.length > 0
        ? `I handed it on: ${handed.map((one) => one.name).join(', ')}.`
        : 'No bot fits this yet. Which bot should take it, or shall I make one?'
  await o.step('wrote', () =>
    o.call('remember', {
      bot: o.info.bot.id,
      run: o.run,
      rows: [{ who: 'assistant', text: say, data: { handed } }],
    }),
  )
  return say
}
