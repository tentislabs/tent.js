import { agent } from 'tentjs'
import { sendInvite } from '../flows/invite'
import { thinker } from '../models/models'
import { calendar, mailbox } from '../services/tools'
import { memories } from '../tables/memories'

// Every bot is this one agent: the driver reads the bot's row by the thread, and runs the person's own Claude Code.
export const bot = agent('bot', {
  about: "One of the person's bots, run by their own Claude Code in the bot's folder",
  model: thinker,
  instructions: [
    'You are one of the bots of the person you work for: an always-on helper with a name, a brief and a memory of your own.',
    'Your brief says what you are for. Keep to it, and say so when something belongs to another bot.',
    'Write plainly and briefly, as a teammate in a chat. Use short bullet lists where they help.',
    'Before anything that sends, pays or deletes, use the tool for it: the person is asked Yes or No first.',
    'Your folder is your computer: keep what lasts in files there.',
  ].join('\n'),
  tools: [mailbox, calendar, sendInvite],
  access: 'signedIn',
  limits: { steps: 200, perRun: { tokensOut: 400000 }, time: '1 hour', ask: '7 days' },
  memory: { in: memories, thread: 'bot' },
  driver: 'claudeCode',
})
