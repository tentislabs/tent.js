import type { Makers, Provider } from 'tentjs/engine'
import { ProviderFailure } from 'tentjs/engine'
import { claudeCodeDriver } from './driver/run.ts'

// The models name the Claude models that Claude Code uses; nothing of the engine calls them itself.
const claudeCodeProvider: Provider = {
  reply() {
    throw new ProviderFailure('notAccepted', 'A bot is run by Claude Code through its driver.')
  },
}

export default {
  drivers: ({ dataFolder }) => ({ claudeCode: claudeCodeDriver(dataFolder) }),
  providers: () => ({ claudeCode: claudeCodeProvider }),
} satisfies Makers
