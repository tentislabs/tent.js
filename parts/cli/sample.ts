const why = 'the first screen runs before any sign-in exists'

/**
 * Takes the name of a new project, in camelCase, and its title. Answers the files that a new project starts with,
 * each by its path: the project, one query and one screen at `/` that reads it, open to anyone with the reason
 * written into each rule, and the `.gitignore` that keeps the engine's own folder, the packages, the made type list
 * and what a test writes under `results/` out of a shared repository.
 */
export const sampleFiles = (name: string, title: string): Record<string, string> => ({
  '.gitignore': '.tent/\nnode_modules/\nresults/\ntent.d.ts\n',
  'tent.ts': `import { project } from 'tentjs'

export const ${name} = project('${name}', {
  title: '${title}',
})
`,
  'functions/greeting.ts': `import { anyone, query, text } from 'tentjs'

export const greeting = query('greeting', {
  about: 'The words that the first screen shows',
  access: anyone('${why}'),
  output: text(),
  run: () => 'Hello from ${title}',
})
`,
  'screens/home.tsx': `import { anyone, read, screen } from 'tentjs/ui'
import { greeting } from '../functions/greeting'

export const homeScreen = screen('homeScreen', {
  path: '/',
  title: '${title}',
  access: anyone('${why}'),
  data: { greeting: read(greeting) },
  view: ({ greeting }) => (
    <main style={{ padding: 24 }}>
      <h1>{greeting}</h1>
    </main>
  ),
})
`,
})
