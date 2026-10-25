import { route } from 'tentjs'

// Whose project the frame of a project shows, answered to the program around the product alone: its `onRequest`
// asks this, then shows the browser the app of the workspace.
export const projectFrame = route('projectFrame', {
  method: ['GET'],
  path: '/frame/:project',
  access: 'signedIn',
  run: async ({ params, db }) => {
    const project = await db.projects.get(params.project)
    const owner = project ? await db.users.get(project.owner) : undefined
    if (!project || !owner) return new Response('That project is not there.', { status: 404 })
    return Response.json({ project: project.id, workspace: project.workspace, email: owner.email })
  },
})
