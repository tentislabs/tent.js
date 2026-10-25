// The program around the product: one engine that holds the product's app, the workspaces of its people,
// and the apps they published. Run: node server.ts <bundle of product/> [--port 3000] [--folder ./run]
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { guardedFetch } from 'tentjs/connect'
import { apartRoom, createEngine, type Makers } from 'tentjs/engine'
import { createWorkspaces } from 'tentjs/workspaces'
import { processBox } from './box.ts'
import { projects } from './product/tables/projects.ts'
import { TICKET, tickets } from './ticket.ts'

export const HERE = fileURLToPath(new URL('.', import.meta.url))

// The product answers at this name, and every app of a workspace under a name of its own below it.
export const PRODUCT_NAME = 'builder.localhost'

export type BuilderOptions = {
  bundle: string
  folder: string
  port: number
  mode?: 'test' | 'live'
  makers?: Makers
  // The words that run `tent` on this computer, for the build of a workspace.
  tent?: readonly string[]
}

type Frame = { project: string; workspace: string; email: string }

function isFrame(value: unknown): value is Frame {
  if (typeof value !== 'object' || value === null) return false
  if (!('project' in value) || !('workspace' in value) || !('email' in value)) return false
  return typeof value.project === 'string' && typeof value.workspace === 'string' && typeof value.email === 'string'
}

type Owned = { owner: { email: string } }

function isOwned(value: unknown): value is Owned {
  if (typeof value !== 'object' || value === null || !('owner' in value)) return false
  const owner = value.owner
  return typeof owner === 'object' && owner !== null && 'email' in owner && typeof owner.email === 'string'
}

export async function startBuilder(o: BuilderOptions) {
  const origin = `http://${PRODUCT_NAME}:${o.port}`
  const workspaceName = (id: string) => `${id}.${PRODUCT_NAME}`
  const liveName = (id: string) => `${id}.live.${PRODUCT_NAME}`
  const ticket = tickets()

  const engine = createEngine({
    port: o.port,
    makers: o.makers,
    onRequest: (request, next) => {
      const url = new URL(request.url)
      if (url.hostname === PRODUCT_NAME && url.pathname.startsWith('/frame/')) return framed(request, next)
      return next(request)
    },
  })
  const app = await engine.open(o.bundle, {
    dataFolder: join(o.folder, 'data'),
    address: `${PRODUCT_NAME}:${o.port}`,
    mode: o.mode ?? 'test',
  })

  // The email of the person whose project a workspace is.
  async function ownerOf(workspace: string): Promise<string | undefined> {
    const rows: unknown = await app.read(projects.where({ workspace }).with('owner').limit(1), { as: 'system' })
    const [row] = Array.isArray(rows) ? rows.filter(isOwned) : []
    return row?.owner.email
  }

  const workspaces = createWorkspaces({
    engine,
    app,
    folder: join(o.folder, 'workspaces'),
    address: (id) => `http://${workspaceName(id)}:${o.port}`,
    fetch: guardedFetch({ mode: o.mode ?? 'test' }),
    templates: { blank: join(HERE, 'templates', 'blank') },
    framedBy: [origin],
    // What a person's AI writes is built in a box of its own and run in a room apart, never in this program.
    sandbox: processBox({ tent: o.tent ?? ['tent'] }),
    room: (input) => apartRoom(input),
    // The app of a workspace knows only the person whose project it is.
    identify: async ({ request, call }) => {
      const id = new URL(request.url).hostname.split('.')[0] ?? ''
      const email = ticket.read(request)
      if (!email || email !== (await ownerOf(id))) return undefined
      const row: unknown = await call({ definition: 'addUser', kind: 'change' }, { email })
      return typeof row === 'object' && row !== null && 'id' in row && typeof row.id === 'string' ? row.id : undefined
    },
    live: (id) => ({ dataFolder: join(o.folder, 'live', id), address: `http://${liveName(id)}:${o.port}` }),
  })

  // The frame of a project: the app of its workspace in the inspect mode, so that the product can point into it,
  // with the ticket by which that app knows its person. Whose project it is, the product's own route answers.
  async function framed(request: Request, next: (request: Request) => Promise<Response>): Promise<Response> {
    const asked = await next(request)
    if (!asked.ok) return asked
    const mine: unknown = await asked.json()
    if (!isFrame(mine)) return new Response('That project is not there.', { status: 404 })
    const token = await workspaces.run(mine.workspace).then(
      (opened) => opened.inspect({ framedBy: origin, for: '8 hours' }),
      () => undefined,
    )
    if (!token)
      return new Response('The app of this project does not run now: its builder is mending it.', { status: 503 })
    const secure = new URL(origin).protocol === 'https:' ? '; Secure' : ''
    return new Response(null, {
      status: 302,
      headers: {
        location: `http://${workspaceName(mine.workspace)}:${o.port}/?t-inspect=${token}`,
        'set-cookie': `${TICKET}=${ticket.make(mine.email)}; Domain=${PRODUCT_NAME}; Path=/; HttpOnly; SameSite=Lax${secure}`,
      },
    })
  }

  return {
    origin,
    engine,
    app,
    workspaces,
    workspaceAddress: (id: string) => `http://${workspaceName(id)}:${o.port}`,
    close: async () => {
      await workspaces.close()
      await engine.close()
    },
  }
}

export type Builder = Awaited<ReturnType<typeof startBuilder>>

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const words = process.argv.slice(2)
  const flag = (name: string, otherwise: string) => {
    const at = words.indexOf(name)
    return at === -1 ? otherwise : (words[at + 1] ?? otherwise)
  }
  const bundle = words.find((word) => !word.startsWith('--'))
  if (!bundle) throw new Error('Name the bundle of product/, as `tent build` wrote it.')
  const builder = await startBuilder({
    bundle,
    folder: resolve(flag('--folder', 'run')),
    port: Number(flag('--port', '3000')),
  })
  process.stderr.write(`The small builder runs at ${builder.origin}\n`)
}
