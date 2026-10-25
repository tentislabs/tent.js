import { Mic, Square } from 'lucide-react'
import { Form, screen, useAgent, useCall, useMicrophone } from 'tentjs/ui'
import { LoneFrame } from '../components/frames'
import { helper } from '../functions/helper'
import { signOut } from '../functions/signIn'
import { hearQuestion } from '../functions/voice'

export const askScreen = screen('askScreen', {
  path: '/ask',
  title: 'Ask us',
  access: 'signedIn',
  layout: LoneFrame,
  view: () => {
    const assistant = useAgent(helper, { speak: true })
    const microphone = useMicrophone()
    const hear = useCall(hearQuestion)
    const recording = microphone.state === 'recording'
    const working = hear.busy || assistant.state === 'queued' || assistant.state === 'running'
    const send = async () => {
      const audio = await microphone.stop()
      if (!audio) return
      const heard = await hear.call({ audio })
      await assistant.send(heard.text)
    }
    const failure = hear.error ?? assistant.error
    return (
      <>
        <section className="rounded-box border border-base-300 bg-base-100 p-6 sm:p-8" aria-label="Ask us">
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Ask us</h1>
            <p className="mt-2 text-sm text-base-content/70">
              Press the button, say your question, and press it again. We answer out loud.
            </p>
          </div>
          <div className="mt-8 flex flex-col items-center gap-4">
            <button
              type="button"
              className={`grid size-24 place-items-center rounded-full text-primary-content shadow-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 ${recording ? 'bg-error' : 'bg-primary hover:brightness-110'}`}
              // The ring around the press grows with the loudness of the voice.
              style={
                recording
                  ? {
                      boxShadow: `0 0 0 ${8 + microphone.level * 24}px color-mix(in oklab, var(--color-error) 18%, transparent)`,
                    }
                  : undefined
              }
              aria-label={recording ? `Send (${microphone.seconds} s)` : 'Talk'}
              disabled={working || microphone.state === 'asking'}
              onClick={() => void (recording ? send() : microphone.start())}
            >
              {recording ? (
                <Square className="size-8" fill="currentColor" aria-hidden="true" />
              ) : (
                <Mic className="size-9" aria-hidden="true" />
              )}
            </button>
            <span className="flex items-center gap-2 text-sm text-base-content/70" role="status">
              {working && <span className="loading loading-dots loading-sm text-primary" aria-hidden="true" />}
              {recording
                ? `Listening, ${microphone.seconds} s`
                : microphone.state === 'asking'
                  ? 'Allow the microphone to go on'
                  : working
                    ? 'Working on your answer'
                    : 'Press to talk'}
            </span>
          </div>
          {microphone.state === 'denied' && (
            <p className="mt-6 rounded-xl bg-error/10 px-4 py-3 text-sm text-error" role="alert">
              The microphone is not allowed on this page. Allow it in the browser, and press the button again.
            </p>
          )}
          {failure && (
            <p className="mt-6 rounded-xl bg-error/10 px-4 py-3 text-sm text-error" role="alert">
              {failure.message}
            </p>
          )}
          {(hear.value || assistant.answer !== '') && (
            <div className="mt-8 space-y-4">
              {hear.value && (
                <div className="flex flex-col items-end gap-1" id="question">
                  <b className="px-1 text-xs font-medium text-base-content/60">You asked</b>
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-content">
                    {hear.value.text}
                  </p>
                </div>
              )}
              {assistant.answer !== '' && (
                <div className="flex flex-col items-start gap-1" id="answer" aria-live="polite">
                  <b className="px-1 text-xs font-medium text-base-content/60">Our answer, read aloud</b>
                  <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-accent px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line text-accent-content">
                    {assistant.answer}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
        <Form id="signOut" call={signOut} className="flex justify-center">
          <button type="submit" className="btn btn-ghost btn-sm text-base-content/70">
            Sign out
          </button>
        </Form>
      </>
    )
  },
})
