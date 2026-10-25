import { BookOpen, FileText, Search, Upload } from 'lucide-react'
import { Form, read, role, screen, useCall, useTranslations } from 'tentjs/ui'
import { StaffFrame, Waiting } from '../components/frames'
import { addGuide, findInGuide, guideList } from '../functions/guides'

const card = 'rounded-box border border-base-300 bg-base-100'
const cardHead = 'flex items-baseline justify-between gap-4 border-b border-base-300 px-5 py-4'
const field = 'flex flex-col gap-1.5 text-sm font-medium'

export const guidesScreen = screen('guidesScreen', {
  path: '/guides',
  title: 'Guides',
  access: role('staff'),
  layout: StaffFrame,
  loading: Waiting,
  data: { guides: read(guideList) },
  view: ({ guides, calls }) => {
    const { format } = useTranslations()
    const find = useCall(findInGuide)
    return (
      <>
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Guides</h1>
          <p className="mt-1 text-sm text-base-content/70">
            The PDF files the assistant answers from, cut into chunks it searches by meaning.
          </p>
        </header>
        <section className={card} aria-label="Guides">
          <div className={cardHead}>
            <h2 className="font-semibold">Guides</h2>
            <span className="text-sm tabular-nums text-base-content/60">{format(guides.length, 'number')}</span>
          </div>
          {guides.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <BookOpen className="size-6 text-base-content/50" aria-hidden="true" />
              <strong className="font-medium">No guide is here yet</strong>
              <span className="text-sm text-base-content/60">
                Upload a PDF, and the assistant reads it a moment later.
              </span>
            </div>
          ) : (
            <ul className="divide-y divide-base-300">
              {guides.map((guide) => (
                <li key={guide.id} id={`guide-${guide.id}`}>
                  <a
                    href={`/_t/files/${guide.file}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-base-200/60 focus-visible:bg-base-200/60"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-content">
                      <FileText className="size-4.5" aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{guide.title}</span>
                      <small className="text-xs text-base-content/60">
                        Added {format(guide.createdAt, 'relative')}
                      </small>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <section className={card} aria-label="Upload a guide">
            <div className={cardHead}>
              <h2 className="font-semibold">Upload a guide</h2>
              <span className="text-xs text-base-content/60">PDF, up to 20 MB</span>
            </div>
            <Form id="upload" call={addGuide} aria-label="Upload a guide" className="space-y-4 p-5">
              <label className={field}>
                Title
                <input name="title" className="input w-full" placeholder="Help desk guide" />
              </label>
              <label className={field}>
                PDF file
                <input name="file" type="file" accept="application/pdf" className="file-input w-full" />
              </label>
              <button type="submit" className="btn btn-primary" disabled={calls.upload.busy}>
                {calls.upload.busy ? (
                  <span className="loading loading-spinner loading-sm" aria-hidden="true" />
                ) : (
                  <Upload className="size-4" aria-hidden="true" />
                )}
                {calls.upload.busy ? 'Uploading' : 'Upload'}
              </button>
            </Form>
          </section>
          <section className={card} aria-label="Search the guides">
            <div className={cardHead}>
              <h2 className="font-semibold">Search the guides</h2>
              <span className="text-xs text-base-content/60">By meaning</span>
            </div>
            <div className="space-y-4 p-5">
              <form
                className="flex items-end gap-2"
                aria-label="Search the guides"
                onSubmit={(sent) => {
                  sent.preventDefault()
                  const question = String(new FormData(sent.currentTarget).get('question') ?? '').trim()
                  if (question) void find.call({ question })
                }}
              >
                <label className={`${field} min-w-0 flex-1`}>
                  Question
                  <input
                    name="question"
                    className="input w-full"
                    autoComplete="off"
                    placeholder="How do I reset a password?"
                  />
                </label>
                <button type="submit" className="btn" disabled={find.busy}>
                  <Search className="size-4" aria-hidden="true" /> Search
                </button>
              </form>
              {find.busy && (
                <p className="flex items-center gap-2 text-sm text-base-content/70" role="status">
                  <span className="loading loading-spinner loading-sm" aria-hidden="true" /> Searching
                </p>
              )}
              {find.error && (
                <p className="text-sm text-error" role="alert">
                  {find.error.message}
                </p>
              )}
              {find.value && find.value.length === 0 && (
                <p className="text-sm text-base-content/60">No chunk of a guide is near that question.</p>
              )}
              {find.value && find.value.length > 0 && (
                <ol className="space-y-3" id="found" aria-label="Found">
                  {find.value.map((chunk) => (
                    <li
                      key={`${chunk.guide} ${chunk.page} ${chunk.text.slice(0, 24)}`}
                      className="rounded-xl border border-base-300 p-4"
                    >
                      <b className="block text-xs font-semibold text-primary">
                        {chunk.title}, page {chunk.page}
                      </b>
                      <span className="mt-1 block text-sm leading-relaxed text-base-content/85">{chunk.text}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>
      </>
    )
  },
})
