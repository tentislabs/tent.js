import '@fontsource-variable/inter'
import { useEffect, useRef } from 'react'
import { component, Link, message, useTranslations } from 'tentjs/ui'
import './site.css'

export const SiteFrame = component('SiteFrame', {
  view: ({ children, language, state }) => {
    const { t } = useTranslations()
    const other = language === 'tr' ? 'en' : 'tr'
    // `assets/mode.js` sets the look before the first paint; only a later pick on the living page sets it here.
    const picked = useRef(false)
    useEffect(() => {
      if (picked.current) document.documentElement.dataset.mode = state.mode
      picked.current = true
    }, [state.mode])
    return (
      <div className="site">
        <a className="skip" href="#content">
          {message('site.skip')}
        </a>
        <header className="bar">
          <Link to="/" className="brand" exact>
            {message('site.name')}
          </Link>
          <nav aria-label={t('site.links')} className="links">
            <Link to="/" exact>
              {message('site.home')}
            </Link>
            <Link to="/pricing">{message('pricing.title')}</Link>
            <Link to="/gallery">{message('gallery.title')}</Link>
            <Link to="/contact">{message('contact.title')}</Link>
            <Link language={other} hrefLang={other} lang={other}>
              {message('site.otherLanguage')}
            </Link>
          </nav>
          <fieldset className="look">
            <legend>{message('site.look')}</legend>
            <Link set={{ mode: 'light' }} aria-pressed={state.mode === 'light'} role="button">
              {message('site.light')}
            </Link>
            <Link set={{ mode: 'dark' }} aria-pressed={state.mode === 'dark'} role="button">
              {message('site.dark')}
            </Link>
          </fieldset>
        </header>
        <div id="content" className="content">
          {children}
        </div>
        <footer className="foot">
          <div className="foot-inner">
            <p>{message('site.footer')}</p>
            <nav aria-label={t('site.footLinks')}>
              <Link to="/pricing">{message('pricing.title')}</Link>
              <Link to="/gallery">{message('gallery.title')}</Link>
              <Link to="/contact">{message('contact.title')}</Link>
            </nav>
          </div>
        </footer>
      </div>
    )
  },
})
