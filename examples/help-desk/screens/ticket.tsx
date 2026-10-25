import { ArrowLeft, Send, Sparkles } from 'lucide-react'
import { Form, Link, read, role, screen, useAgent, useTranslations } from 'tentjs/ui'
import { StaffFrame, Waiting } from '../components/frames'
import { StatusPill } from '../components/status'
import { helper } from '../functions/helper'
import { answerTicket, closeTicket, getTicket, ticketMessages } from '../functions/tickets'

type Said = { who: string; by?: string; run?: string }
type Speaker = { name: string; side: 'start' | 'end'; bubble: string }

// Who said a line: the memory holds the customer's mail, the staff's asks and answers, and the assistant's drafts.
function speakerOf(line: Said, customer: string): Speaker {
  if (line.who === 'user')
    return line.by
      ? { name: 'Staff, to the assistant', side: 'end', bubble: 'border border-base-300 bg-base-200 text-base-content' }
      : { name: customer, side: 'start', bubble: 'border border-base-300 bg-base-200 text-base-content' }
  return line.run
    ? { name: 'Assistant', side: 'start', bubble: 'bg-accent text-accent-content' }
    : { name: 'Staff answered', side: 'end', bubble: 'bg-primary text-primary-content' }
}

// What the assistant asks before a tool that needs a yes.
function question(tool: string, input: unknown): string {
  const order = typeof input === 'object' && input !== null ? Reflect.get(input, 'order') : undefined
  return tool === 'refundOrder' ? `Refund the order ${String(order ?? '')}?` : `Run ${tool}?`
}

const card = 'rounded-box border border-base-300 bg-base-100'
const cardHead = 'flex items-baseline justify-between gap-4 border-b border-base-300 px-5 py-4'

export const ticketScreen = screen('ticketScreen', {
  path: '/tickets/:id',
  title: 'A ticket',
  access: role('staff'),
  layout: StaffFrame,
  loading: Waiting,
  data: ({ params }) => ({
    ticket: read(getTicket, { id: params.id }, { needed: true }),
    conversation: read(ticketMessages, { ticket: params.id }),
  }),
  view: ({ ticket, conversation, calls }) => {
    const { format } = useTranslations()
    const assistant = useAgent(helper, { thread: ticket.id })
    const working = assistant.state === 'queued' || assistant.state === 'running'
    const lines = conversation.filter((line) => line.text)
    return (
      <>
        <Link
          to="/tickets"
          className="inline-flex items-center gap-1.5 text-sm text-base-content/70 hover:text-base-content"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Tickets
        </Link>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
            <p className="mt-1 text-sm text-base-content/70">
              From {ticket.customer.name}, {format(ticket.createdAt, 'relative')}
            </p>
          </div>
          <StatusPill status={ticket.status} />
        </header>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <section className={card} aria-label="Conversation">
            <div className={cardHead}>
              <h2 className="font-semibold">Conversation</h2>
              <span className="text-sm text-base-content/60">{format(lines.length, 'number')} messages</span>
            </div>
            <div className="space-y-4 p-5">
              {lines.length === 0 && (
                <p className="text-sm text-base-content/60">Nothing was said on this ticket yet.</p>
              )}
              {lines.map((line) => {
                const speaker = speakerOf(line, ticket.customer.name)
                return (
                  <div
                    className={`flex flex-col gap-1 ${speaker.side === 'end' ? 'items-end' : 'items-start'}`}
                    key={line.id}
                    id={`said-${line.id}`}
                  >
                    <b className="px-1 text-xs font-medium text-base-content/60">{speaker.name}</b>
                    <p
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${speaker.bubble} ${speaker.side === 'end' ? 'rounded-br-md' : 'rounded-bl-md'}`}
                    >
                      {line.text}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>
          <div className="grid gap-4">
            <section className={card} aria-label="Assistant">
              <div className={cardHead}>
                <h2 className="flex items-center gap-2 font-semibold">
                  <Sparkles className="size-4 text-primary" aria-hidden="true" /> Assistant
                </h2>
                <span className="text-xs text-base-content/60">From the guide and past tickets</span>
              </div>
              <div className="space-y-4 p-5">
                <form
                  className="flex items-end gap-2"
                  aria-label="Ask the assistant"
                  onSubmit={(sent) => {
                    sent.preventDefault()
                    const form = sent.currentTarget
                    const message = String(new FormData(form).get('message') ?? '').trim()
                    if (message) void assistant.send(message)
                    form.reset()
                  }}
                >
                  <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium">
                    Ask the assistant
                    <input
                      name="message"
                      className="input w-full"
                      autoComplete="off"
                      placeholder="How do I reset a password?"
                    />
                  </label>
                  <button type="submit" className="btn btn-primary" disabled={working}>
                    Ask
                  </button>
                </form>
                {working && !assistant.answer && (
                  <p className="flex items-center gap-2 text-sm text-base-content/70" role="status">
                    <span className="loading loading-dots loading-sm text-primary" aria-hidden="true" /> The assistant
                    is at work
                  </p>
                )}
                {assistant.state !== 'idle' && assistant.answer !== '' && (
                  <p
                    className="rounded-xl bg-accent px-4 py-3 text-sm leading-relaxed whitespace-pre-line text-accent-content"
                    id="draft"
                    aria-live="polite"
                  >
                    {assistant.answer}
                  </p>
                )}
                {assistant.asks.map((ask) => (
                  <fieldset
                    className="rounded-xl border border-warning/50 bg-warning/10 px-4 pt-3 pb-4"
                    key={`${ask.run} ${ask.step}`}
                  >
                    <legend id="ask" className="float-left mb-3 w-full text-sm font-medium">
                      {question(ask.tool, ask.input)}
                    </legend>
                    <div className="clear-left flex gap-2">
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => void assistant.approve(ask)}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm border-base-300 bg-base-100"
                        onClick={() => void assistant.refuse(ask)}
                      >
                        No
                      </button>
                    </div>
                  </fieldset>
                ))}
                {assistant.error && (
                  <p className="text-sm text-error" role="alert">
                    {assistant.error.message}
                  </p>
                )}
              </div>
            </section>
            <section className={card} aria-label="Answer">
              <div className={cardHead}>
                <h2 className="font-semibold">Answer the customer</h2>
                <span className="text-xs text-base-content/60">Sent by mail</span>
              </div>
              <div className="space-y-3 p-5">
                <Form
                  id="answer"
                  call={answerTicket}
                  with={{ ticket: ticket.id }}
                  values={{ text: assistant.answer }}
                  className="space-y-3"
                >
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    Answer
                    <textarea
                      name="text"
                      className="textarea min-h-28 w-full"
                      placeholder="Write the answer, or ask the assistant for a draft"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" className="btn btn-primary" disabled={calls.answer.busy}>
                      <Send className="size-4" aria-hidden="true" /> Send answer
                    </button>
                  </div>
                </Form>
                {calls.answer.value !== undefined && (
                  <p className="text-sm text-success" role="status">
                    The answer is on its way.
                  </p>
                )}
                {ticket.status !== 'closed' && (
                  <Form id="close" call={closeTicket} with={{ ticket: ticket.id }}>
                    <button
                      type="submit"
                      className="btn btn-ghost btn-sm text-base-content/70"
                      disabled={calls.close.busy}
                    >
                      Close ticket
                    </button>
                  </Form>
                )}
              </div>
            </section>
            <section className={card} aria-label="The ticket">
              <dl className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-2.5 p-5 text-sm">
                <dt className="text-base-content/60">Customer</dt>
                <dd className="font-medium">{ticket.customer.name}</dd>
                <dt className="text-base-content/60">Email</dt>
                <dd className="truncate">{ticket.customer.email}</dd>
                <dt className="text-base-content/60">Tier</dt>
                <dd className="capitalize">{ticket.customer.tier}</dd>
                <dt className="text-base-content/60">Order</dt>
                <dd className={ticket.order ? 'font-mono text-xs leading-5' : 'text-base-content/60'}>
                  {ticket.order ?? 'None named'}
                </dd>
              </dl>
            </section>
          </div>
        </div>
      </>
    )
  },
})
