import { anyone, boolean, Form, Link, screen, useTranslations, message } from 'tentjs/ui'
import { SiteFrame } from '../components/SiteFrame'
import { sendMessage } from '../functions/messages'
import './contact.css'

export const contactScreen = screen('contactScreen', {
  path: '/contact',
  title: message('contact.title'),
  access: anyone('the contact form is for every visitor'),
  layout: SiteFrame,
  seo: { description: message('contact.description') },
  state: { sent: { type: boolean(), in: 'address' } },
  view: ({ state, calls }) => {
    const { t } = useTranslations()
    return (
      <main className="contact">
        <h1>{message('contact.title')}</h1>
        {state.sent ? (
          <section className="thanks" aria-live="polite">
            <h2>{message('contact.thanks')}</h2>
            <p>{message('contact.thanksMore')}</p>
            <Link set={{ sent: false }}>{message('contact.another')}</Link>
          </section>
        ) : (
          <>
            <p className="lead">{message('contact.lead')}</p>
            <Form id="message" call={sendMessage} then={{ set: { sent: true } }} aria-label={t('contact.form')}>
              <label>
                {message('contact.email')}
                <input name="email" type="email" autoComplete="email" required maxLength={254} />
              </label>
              <label>
                {message('contact.message')}
                <textarea name="text" rows={6} required maxLength={5000} />
              </label>
              <button type="submit" className="button" disabled={calls.message?.busy}>
                {message('contact.send')}
              </button>
            </Form>
          </>
        )}
      </main>
    )
  },
})
