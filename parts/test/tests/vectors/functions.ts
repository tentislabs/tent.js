import { action, model, text } from 'tentjs'

export const thinker = model('thinker', { provider: 'mine', name: 'm-1', abilities: ['reply'] })

// An action that writes nothing: a reader carries it out itself, model call and all.
export const greet = action('greet', {
  access: 'signedIn',
  changes: false,
  output: text(),
  run: async () => thinker.reply('Say hello.'),
})
