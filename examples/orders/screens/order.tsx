import { ArrowLeft, Check, Download, FileText, Paperclip } from 'lucide-react'
import type { ReactNode } from 'react'
import { Form, Link, read, screen, useField, useTranslations } from 'tentjs/ui'
import { StaffFrame, Waiting } from '../components/frames'
import { Avatar, Badge, button, Card, Heading, label } from '../components/ui'
import { attachReceipt, getOrder, markPaid } from '../functions/orders'

function ReceiptField({ label: words, hint }: { label: string; hint: string }) {
  const field = useField('receipt')
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={field.input.id} className="text-sm font-medium">
        {words}
      </label>
      <input {...field.input} className="file-input file-input-sm w-full aria-invalid:file-input-error" />
      {field.error ? (
        <p id={field.errorId} className="text-sm text-error">
          {field.error}
        </p>
      ) : (
        <p className="text-xs text-base-content/70">{hint}</p>
      )}
    </div>
  )
}

// Goes back the way the person came, so the list is shown with its tab, its page and its place.
function Back({ words, to }: { words: string; to: '/orders' | '/mine' }) {
  return (
    <Link
      to={to}
      exact
      onClick={(event) => {
        if (history.length < 2) return
        event.preventDefault()
        history.back()
      }}
      className={`${button.ghost} btn-sm -ms-3 self-start`}
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {words}
    </Link>
  )
}

function Fact({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div>
      <dt className={label}>{name}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  )
}

export const orderScreen = screen('orderScreen', {
  path: '/orders/:id',
  title: 'Order',
  access: 'signedIn',
  layout: StaffFrame,
  loading: Waiting,
  data: ({ params }) => ({ order: read(getOrder, { id: params.id }, { needed: true }) }),
  view: ({ order, user, calls }) => {
    const { t, format } = useTranslations()
    const staff = user?.roles.includes('staff') ?? false
    const own = order.placedBy === user?.id
    return (
      <>
        <Back words={staff ? t('order.back') : t('order.backMine')} to={staff ? '/orders' : '/mine'} />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={order.customer.name} />
            <div className="min-w-0">
              <Heading className="text-2xl font-semibold tracking-tight">
                {t('order.title', { name: order.customer.name })}
              </Heading>
              <p className="mt-0.5 text-sm text-base-content/70 tabular-nums">
                {t('order.number', { number: order.id.slice(-6).toUpperCase() })}
              </p>
            </div>
          </div>
          {staff && order.status === 'open' && (
            <Form id="pay" call={markPaid} with={{ order: order.id }}>
              <button type="submit" className={button.primary} disabled={calls.pay?.busy}>
                {calls.pay?.busy ? (
                  <span aria-hidden="true" className="loading loading-spinner loading-sm" />
                ) : (
                  <Check aria-hidden="true" className="size-4" />
                )}
                {t('order.markPaid')}
              </button>
            </Form>
          )}
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-5 p-5 sm:grid-cols-2 sm:p-6">
              <div className="sm:col-span-2">
                <dt className={label}>{t('order.total')}</dt>
                <dd className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
                  {format(order.total, 'currency')}
                </dd>
              </div>
              <Fact name={t('order.status')}>
                <Badge tone={order.status}>{t(`status.${order.status}`)}</Badge>
              </Fact>
              <Fact name={t('order.placed')}>
                <span className="tabular-nums">{format(order.placedAt, 'date')}</span>
              </Fact>
              <Fact name={t('order.customer')}>
                {order.customer.name}
                <span className="block text-base-content/70">{order.customer.email}</span>
              </Fact>
              <Fact name={t('order.note')}>
                <span className={order.note ? '' : 'text-base-content/50'}>{order.note ?? t('order.noNote')}</span>
              </Fact>
            </dl>
          </Card>

          <Card title={t('order.receipt')}>
            <div className="flex flex-col gap-4 p-5">
              {order.receipt ? (
                <a
                  href={`/_t/files/${order.receipt}`}
                  download
                  className="flex items-center gap-3 rounded-field border border-base-300 p-3 transition-colors hover:bg-base-200"
                >
                  <span className="inline-flex size-9 items-center justify-center rounded-field bg-error/10 text-error">
                    <FileText aria-hidden="true" className="size-4" />
                  </span>
                  <span className="flex-1 text-sm font-medium">{t('order.download')}</span>
                  <Download aria-hidden="true" className="size-4 text-base-content/50" />
                </a>
              ) : (
                <p className="text-sm text-base-content/70">{t('order.noReceipt')}</p>
              )}
              {own && (
                <Form id="receipt" call={attachReceipt} with={{ order: order.id }} className="flex flex-col gap-3">
                  <ReceiptField label={t('order.file')} hint={t('order.receiptHint')} />
                  <button type="submit" className={`${button.quiet} btn-sm self-start`} disabled={calls.receipt?.busy}>
                    {calls.receipt?.busy ? (
                      <span aria-hidden="true" className="loading loading-spinner loading-xs" />
                    ) : (
                      <Paperclip aria-hidden="true" className="size-4" />
                    )}
                    {t('order.attach')}
                  </button>
                </Form>
              )}
            </div>
          </Card>
        </div>
      </>
    )
  },
})
