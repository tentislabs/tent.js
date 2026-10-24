import { anyone, asset, Image, Link, message, read, screen, useTranslations } from 'tentjs/ui'
import { Markdown } from '../components/Markdown'
import { SiteFrame } from '../components/SiteFrame'
import { featureIds, getFeature } from '../functions/features'
import './feature.css'

export const featureScreen = screen('featureScreen', {
  path: '/features/:id',
  data: ({ params }) => ({ feature: read(getFeature, { id: params.id }, { needed: true }) }),
  title: ({ feature }) => feature.name,
  access: anyone('the feature pages are for every visitor'),
  layout: SiteFrame,
  seo: {
    description: ({ feature }) => feature.summary,
    image: ({ feature }) => asset(feature.picture),
    addresses: read(featureIds),
  },
  view: ({ feature, state }) => {
    const { t } = useTranslations()
    return (
      <main className="feature">
        <Link to="/gallery" className="back">
          {message('feature.back')}
        </Link>
        <h1>{feature.name}</h1>
        <p className="lead">{feature.summary}</p>
        <Image
          src={asset(feature.picture)}
          alt=""
          className="feature-picture"
          sizes="(min-width: 900px) 800px, 100vw"
          priority
          style={{ viewTransitionName: `picture-${feature.id}` }}
        />
        <Markdown text={feature.body} />
        {feature.video && (
          <section className="video" aria-label={t('feature.video')}>
            {state.videos ? (
              <iframe
                src={feature.video}
                title={t('feature.video')}
                sandbox="allow-scripts allow-same-origin allow-presentation"
                allow="fullscreen; picture-in-picture"
                loading="lazy"
              />
            ) : (
              <div className="stand-in">
                <p>{message('feature.standIn')}</p>
                <Link set={{ videos: true }} role="button" className="button">
                  {message('feature.showVideos')}
                </Link>
              </div>
            )}
          </section>
        )}
      </main>
    )
  },
})
