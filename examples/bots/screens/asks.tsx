import { read, screen, useCall } from 'tentjs/ui'
import { Face } from '../components/Face'
import { Frame } from '../components/Frame'
import { askTitle, DraftCard, QuestionCard } from '../components/Talk'
import { answerAsk, askList } from '../functions/runs'

export const asksScreen = screen('asksScreen', {
  path: '/asks',
  title: 'Asks',
  access: 'signedIn',
  layout: Frame,
  data: { asks: read(askList) },
  view: ({ asks }) => {
    const answer = useCall(answerAsk)
    return (
      <main className="chat">
        <div className="page">
          <div className="page-inner">
            <h1>Asks</h1>
            <p className="page-lead">What your bots wait for until you answer.</p>
            {asks.length === 0 ? (
              <p className="empty">Nothing waits for you.</p>
            ) : (
              <ul className="ask-list">
                {asks.map((ask) => (
                  <li key={ask.id} id={`ask-${ask.id}`}>
                    <p className="ask-of">
                      <Face shape={ask.bot.shape} colour={ask.bot.colour} size={22} />
                      {ask.bot.name}
                    </p>
                    {ask.kind === 'question' ? (
                      <QuestionCard
                        question={ask.question ?? ''}
                        choices={ask.choices}
                        busy={answer.busy}
                        onPick={(choice) => void answer.call({ ask: ask.id, yes: true, answer: choice })}
                      />
                    ) : (
                      <DraftCard
                        title={askTitle(ask.tool, ask.bot.name)}
                        input={ask.input}
                        answers={
                          <>
                            <button
                              type="button"
                              className="light"
                              disabled={answer.busy}
                              onClick={() => void answer.call({ ask: ask.id, yes: true })}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              className="outlined"
                              disabled={answer.busy}
                              onClick={() => void answer.call({ ask: ask.id, yes: false })}
                            >
                              No
                            </button>
                          </>
                        }
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    )
  },
})
