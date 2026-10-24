import type { Description } from '../../core/internal.ts'
import { coreVersion, isStored } from '../../core/internal.ts'
import { mcpOf } from './offered.ts'
import { app, newest, older } from './standard.ts'

/**
 * What the layer says of itself, in the form of the version it is asked in: which versions it speaks, that it has
 * tools and whether it tells when they change, the part of the standard that each method of `mcp.on` belongs to,
 * the files of its screens with the extension that shows them, and who it is. The opening of an older form answers
 * its own version; the newest form lists every one.
 */
export function helloOf(description: Description, version: string): Record<string, unknown> {
  const project = mcpOf(description)
  const capabilities: Record<string, object> = { tools: { listChanged: project.stream === true } }
  // A method is named as `<part>/<what>`: the first word is the part of the standard it belongs to.
  for (const method of Object.keys(isStored(project.on) ? project.on : {})) {
    const [part] = method.split('/')
    if (part && part !== 'tools') capabilities[part] ??= {}
  }
  // A screen that is offered is a file to be read, which a chat app shows by the standard's extension for it.
  if (Object.keys(Object(Object(description.mcp).screens)).length) {
    capabilities.resources ??= {}
    capabilities.extensions = { [app.extension]: {} }
  }
  const title: unknown = description.project.title
  const serverInfo = {
    name: description.app.name,
    ...(typeof title === 'string' ? { title } : {}),
    version: coreVersion,
  }
  return version === newest
    ? { supportedVersions: [newest, ...older], capabilities, serverInfo }
    : { protocolVersion: version, capabilities, serverInfo }
}
