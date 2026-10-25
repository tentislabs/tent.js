import { agent } from 'tentjs'
import { botList, readBrief } from '../functions/bots'
import { quick } from '../models/models'
import { memories } from '../tables/memories'
import { bot } from './bot'

export const chief = agent('chief', {
  about: 'Routes what the person asks to the bot whose brief fits, and asks the person where none does',
  model: quick,
  instructions: [
    'You are the chief of the bots of the person you work for. You do no work yourself: you route it.',
    'Split what the person asks into tasks, and give each task to the bot whose brief fits it best.',
    'Where no bot fits a task, say so and ask the person which bot should take it, or whether to make one.',
    'Tell the person in one or two lines what you handed to whom.',
  ].join('\n'),
  tools: [botList, readBrief],
  access: 'signedIn',
  limits: { steps: 50, perRun: { tokensOut: 100000 }, time: '1 hour', ask: '7 days' },
  memory: { in: memories, thread: 'bot' },
  handsOver: [bot],
  driver: 'claudeCode',
})
