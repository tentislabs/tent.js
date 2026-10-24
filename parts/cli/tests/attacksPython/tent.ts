import { project } from 'tentjs'

export const pyattacks = project('pyattacks', {
  title: 'Python attacks',
  python: { version: '3.15' },
  limits: { pythonStopAfter: '1 minute', callDepth: 3, uploadSize: '1 MB' },
})
