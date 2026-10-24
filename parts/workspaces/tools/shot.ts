import { readFileSync, rmSync } from 'node:fs'
import { number, object, TentError, text } from '../../core/index.ts'
import { runWorkspace } from '../opening.ts'
import type { ProjectTool } from './face.ts'

/** The error of a `shot` of anything but a path of the workspace's own app. */
const notOwn = (path: string): TentError =>
  new TentError('T0002', `\`shot\` takes a path of the app, and was handed ${JSON.stringify(path).slice(0, 80)}.`, {
    fields: { path: 'pattern' },
    fix: 'Name a path of the app, as `/orders`: a full address is no path of it.',
  })

/**
 * `shot`: a picture of a screen of the workspace's own app, by a path of it, as nobody or as a user of it, which the
 * model is given as an image.
 */
export const shotTool: ProjectTool = {
  name: 'shot',
  about: 'A picture of a screen of the app, by its path, as nobody or as a user of the app by the id of their row.',
  input: {
    path: text({ min: 1 }),
    as: text({ optional: true }),
    size: object(
      { width: number({ min: 100, max: 4000 }), height: number({ min: 100, max: 4000 }) },
      { optional: true },
    ),
  },
  writes: false,
  async run(at, input) {
    const path = String(input.path)
    if (!path.startsWith('/') || path.startsWith('//') || /[\\\s]/.test(path) || /^\/+[a-z]+:/i.test(path))
      throw notOwn(path)
    const app = await runWorkspace(at.held, at.one.workspace.id)
    const size: unknown = input.size
    const shot = await app.shot(path, {
      ...(typeof input.as === 'string' ? { as: input.as } : {}),
      ...(typeof size === 'object' && size !== null
        ? { size: { width: Number(Reflect.get(size, 'width')), height: Number(Reflect.get(size, 'height')) } }
        : {}),
    })
    // The model is given the picture itself, as an image of the answer: no place on the disk of the product.
    const bytes = readFileSync(shot.file)
    rmSync(shot.file, { force: true })
    return {
      width: shot.width,
      height: shot.height,
      status: shot.status,
      images: [{ kind: 'image/png', data: bytes.toString('base64') }],
    }
  },
}
