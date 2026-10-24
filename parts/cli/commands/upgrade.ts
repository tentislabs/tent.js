import type { Command } from '../command.ts'
import type { Upgrade } from '../upgrade.ts'
import { upgradeProject } from '../upgrade.ts'
import { list } from '../upgrades/list.ts'

/**
 * Rewrites a project for a breaking change of a major version: records a point, runs each step of the upgrades
 * from the line the project names to this one over its files, runs the check, and prints what it changed in the
 * terms of compare. With no step for this version it says so, and ends with 0.
 */
export const command: Command = {
  name: 'upgrade',
  args: {},
  needs: 'project',
  run: async ({ folder }) => {
    // The folder holds no step until a major version brings one: its list may be empty.
    const listed: readonly { load(): Promise<{ upgrade: Upgrade }> }[] = list
    const upgrades: Upgrade[] = []
    for (const one of listed) upgrades.push((await one.load()).upgrade)
    const done = await upgradeProject(folder, upgrades)
    return { value: done, findings: done.findings }
  },
}
