import { useEffect, useRef } from 'react'
import { anyone, asset, Image, Link, message, read, screen, useTranslations } from 'tentjs/ui'
import { CountUp } from '../components/CountUp'
import { SiteFrame } from '../components/SiteFrame'
import { featureList } from '../functions/features'
import { featureScreen } from './feature'
import './home.css'

const shops = 12480

/** Each letter is its own element, so that CSS can let them arrive one after another; a reader hears the whole line. */
function Arriving({ words }: { words: string }) {
  let index = 0
  return (
    <h1 className="headline" aria-label={words}>
      {words.split(' ').map((one, place) => (
        <span key={`${one}-${place}`} aria-hidden="true">
          {place > 0 && ' '}
          <span className="word">
            {[...one].map((letter) => {
              index += 1
              return (
                <span key={index} className="letter" style={{ animationDelay: `${index * 32}ms` }}>
                  {letter}
                </span>
              )
            })}
          </span>
        </span>
      ))}
    </h1>
  )
}

/**
 * Lets each card that is still below the fold rise once it comes into view. The first HTML and a page with no script
 * hide nothing, and a card that was already in view is never hidden again.
 */
function useRise() {
  const list = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const cards = [...(list.current?.children ?? [])].filter((one) => one instanceof HTMLElement)
    if (cards.length === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const below = cards.filter((one) => one.getBoundingClientRect().top > window.innerHeight)
    for (const one of below) one.dataset.rise = 'waiting'
    const seen = new IntersectionObserver(
      (entries) => {
        const coming = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target)
        coming.forEach((one, place) => {
          if (!(one instanceof HTMLElement)) return
          one.style.transitionDelay = `${place * 120}ms`
          one.dataset.rise = 'risen'
          // The turn of a card counts for its rise alone, and never slows a later hover.
          one.addEventListener('transitionend', () => one.style.removeProperty('transition-delay'), { once: true })
          seen.unobserve(one)
        })
      },
      { threshold: 0.15 },
    )
    for (const one of below) seen.observe(one)
    return () => seen.disconnect()
  }, [])
  return list
}

export const homeScreen = screen('homeScreen', {
  path: '/',
  title: message('home.title'),
  access: anyone('the home page is for every visitor'),
  layout: SiteFrame,
  seo: { description: message('home.description'), image: asset('hero.png') },
  data: { cards: read(featureList, { limit: 3 }) },
  view: ({ cards }) => {
    const { t } = useTranslations()
    const rising = useRise()
    return (
      <main className="home">
        <section className="hero">
          <div className="hero-words">
            <p className="eyebrow">{message('home.eyebrow')}</p>
            <Arriving words={t('home.headline')} />
            <p className="lead">{message('home.lead')}</p>
            <div className="actions">
              <Link to="/pricing" className="button">
                {message('home.cta')}
              </Link>
              <Link to="/gallery" className="button quiet">
                {message('home.ctaGallery')}
              </Link>
            </div>
          </div>
          <div className="hero-frame">
            <Image
              src={asset('hero.png')}
              alt={t('home.heroAlt')}
              className="hero-picture"
              sizes="(min-width: 900px) 560px, 100vw"
              priority
            />
          </div>
        </section>

        <section className="cards" aria-labelledby="cards-title">
          <div className="section-head">
            <h2 id="cards-title">{message('home.cardsTitle')}</h2>
            <p className="lead">{message('home.cardsLead')}</p>
          </div>
          <ul ref={rising}>
            {cards.map((card) => (
              <li key={card.id} className="card">
                <Image src={asset(card.picture)} alt="" sizes="(min-width: 900px) 340px, 92vw" />
                <div className="card-words">
                  <h3>{card.name}</h3>
                  <p>{card.summary}</p>
                  <Link to={featureScreen} with={{ id: card.id }}>
                    {message('home.more', { name: card.name })}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="pinned" aria-labelledby="pinned-title">
          <div className="pinned-hold">
            <div className="pinned-panel">
              <p className="pinned-eyebrow">{message('home.pinnedEyebrow')}</p>
              <h2 id="pinned-title">{message('home.pinnedTitle')}</h2>
              <p>{message('home.pinnedLead')}</p>
            </div>
          </div>
          <ol className="pinned-steps">
            <li>{message('home.stepScan')}</li>
            <li>{message('home.stepPay')}</li>
            <li>{message('home.stepStock')}</li>
          </ol>
        </section>

        <section className="count" aria-labelledby="count-label">
          <p className="count-eyebrow">{message('home.countEyebrow')}</p>
          <CountUp to={shops} />
          <p className="count-label" id="count-label">
            {message('home.countLabel')}
          </p>
        </section>

        <section className="closing" aria-labelledby="closing-title">
          <h2 id="closing-title">{message('home.closingTitle')}</h2>
          <p className="lead">{message('home.closingLead')}</p>
          <div className="actions">
            <Link to="/pricing" className="button">
              {message('home.cta')}
            </Link>
            <Link to="/contact" className="button quiet">
              {message('home.closingContact')}
            </Link>
          </div>
        </section>
      </main>
    )
  },
})
