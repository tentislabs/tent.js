import { describeProject } from '../../../build/index.ts'
import { isStored, knownModel } from '../../../core/internal.ts'
import type { Command } from '../../command.ts'

/**
 * Lists every model of the project with what it can do: its provider and its name there, its abilities and the
 * most tokens one request may hold, as the definition states them or the list of its provider knows them, its
 * voices, whether it is a function, its limits and its fall-backs. `tent models test` tries them.
 */
export const command: Command = {
  name: 'models',
  args: {},
  needs: 'project',
  run: async ({ folder }) => {
    const { description, findings } = await describeProject(folder)
    const value = Object.entries(description.models).map(([name, model]) => {
      const known = knownModel(model)
      const isFunction = model.call !== undefined || (model.input !== undefined && model.output !== undefined)
      return {
        name,
        provider: String(model.provider),
        model: String(model.name),
        abilities: known.abilities ?? [],
        ...(known.takes === undefined ? {} : { takes: known.takes }),
        ...(known.voices ? { voices: known.voices } : {}),
        function: isFunction,
        ...(isStored(model.limits) ? { limits: model.limits } : {}),
        fallback: Array.isArray(model.fallback) ? model.fallback.map(String) : [],
      }
    })
    return { value, findings: findings.filter((one) => one.level === 'error') }
  },
}
