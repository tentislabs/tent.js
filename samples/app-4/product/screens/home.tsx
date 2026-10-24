import { AppWindow, ChevronRight, Plus } from 'lucide-react'
import { Form, Link, read, screen } from 'tentjs/ui'
import { AppFrame, Waiting } from '../components/frame'
import { Mark } from '../components/icons'
import { myProjects, newProject } from '../functions/projects'
import { projectScreen } from './project'

export const homeScreen = screen('homeScreen', {
  path: '/',
  title: 'Your projects',
  access: 'signedIn',
  layout: AppFrame,
  loading: Waiting,
  data: { projects: read(myProjects) },
  view: ({ projects, calls }) => (
    <>
      <header className="border-b border-base-300 bg-base-100">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4 sm:px-6">
          <Link to={homeScreen} className="flex items-center gap-2.5 text-sm font-semibold">
            <span className="grid size-8 place-items-center rounded-field bg-primary text-primary-content">
              <Mark />
            </span>
            Small builder
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-4 py-10 sm:px-6 sm:py-14">
        <section className="max-w-2xl space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Describe an app. Watch it being built.
          </h1>
          <p className="text-base text-base-content/70 text-pretty">
            Each project is an app of your own, built by an AI beside the chat, tried on test data, and published when
            you say so.
          </p>
        </section>

        <Form
          id="new"
          call={newProject}
          aria-label="New project"
          className="flex max-w-2xl flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-4 sm:flex-row sm:items-end sm:p-5"
          then={(made) => (made ? { goTo: projectScreen, with: { id: made.id } } : {})}
        >
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium">Name</span>
            <input className="input w-full" name="name" placeholder="My to-do list" autoComplete="off" required />
          </label>
          <button type="submit" className="btn btn-primary" disabled={calls.new.busy}>
            {calls.new.busy ? (
              <span className="loading loading-spinner loading-sm" aria-hidden="true" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )}
            New project
          </button>
        </Form>

        <section aria-labelledby="projects-head" className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 id="projects-head" className="text-lg font-semibold">
              Projects
            </h2>
            {projects.length > 0 && <span className="badge badge-sm tabular-nums">{projects.length}</span>}
          </div>
          {projects.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-box border border-dashed border-base-content/15 px-6 py-14 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-base-100 text-base-content/60">
                <AppWindow className="size-5" aria-hidden="true" />
              </span>
              <h3 className="font-medium">No project yet</h3>
              <p className="max-w-sm text-sm text-base-content/70">
                Name your first one above, then tell the AI what it should be.
              </p>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <li key={project.id} className="min-w-0">
                  <Link
                    to={projectScreen}
                    with={{ id: project.id }}
                    className="group flex h-full flex-col gap-4 rounded-box border border-base-300 bg-base-100 p-5 motion-safe:transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="grid size-10 place-items-center rounded-field bg-primary/10 text-primary">
                        <AppWindow className="size-5" aria-hidden="true" />
                      </span>
                      {project.live ? (
                        <span className="badge badge-sm badge-success badge-soft gap-1.5">
                          <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                          Live
                        </span>
                      ) : (
                        <span className="badge badge-sm badge-ghost">Draft</span>
                      )}
                    </span>
                    <span className="min-w-0 space-y-1">
                      <h3 className="flex items-center gap-1 font-semibold">
                        {project.name}
                        <ChevronRight
                          className="size-4 text-base-content/40 motion-safe:transition-transform group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </h3>
                      <span className="block truncate font-mono text-xs text-base-content/60">
                        {new URL(project.live ?? project.address).host}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  ),
})
