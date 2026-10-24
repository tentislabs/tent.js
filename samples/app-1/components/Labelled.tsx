import { type ReactNode, useState } from 'react'
import { useField, useTranslations } from 'tentjs/ui'

function Shell({
  id,
  label,
  hint,
  error,
  errorId,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  errorId: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={errorId} className="text-sm text-error">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-base-content/70">{hint}</p>
      )}
    </div>
  )
}

const kinds = {
  input: 'input w-full aria-invalid:input-error',
  select: 'select w-full aria-invalid:select-error',
  textarea: 'textarea w-full aria-invalid:textarea-error',
}

// A field of the form it stands in: its label, its control, and the words of its failure under it.
export function Labelled({
  name,
  label,
  hint,
  control: kind = 'input',
  type,
  autoComplete,
  children,
}: {
  name: string
  label: string
  hint?: string
  control?: 'input' | 'select' | 'textarea'
  type?: string
  autoComplete?: string
  children?: ReactNode
}) {
  const field = useField(name)
  return (
    <Shell id={field.input.id} label={label} hint={hint} error={field.error} errorId={field.errorId}>
      {kind === 'select' ? (
        <select {...field.input} className={kinds.select}>
          {children}
        </select>
      ) : kind === 'textarea' ? (
        <textarea {...field.input} rows={3} className={kinds.textarea} />
      ) : (
        <input {...field.input} type={type ?? field.input.type} autoComplete={autoComplete} className={kinds.input} />
      )}
    </Shell>
  )
}

// Money as people write it, "42.50", sent as the whole number of cents that the input takes.
export function MoneyField({ name, label }: { name: string; label: string }) {
  const field = useField(name)
  const { format } = useTranslations()
  const [typed, setTyped] = useState('')
  const symbol = format(0, 'currency').replace(/[\d.,\s]/g, '')
  const take = (text: string) => {
    setTyped(text)
    const amount = Number.parseFloat(text.replace(',', '.'))
    field.set(text.trim() === '' || Number.isNaN(amount) ? undefined : Math.round(amount * 100))
  }
  return (
    <Shell id={field.input.id} label={label} error={field.error} errorId={field.errorId}>
      <div className="input w-full has-aria-invalid:input-error">
        <span aria-hidden="true" className="text-base-content/50">
          {symbol}
        </span>
        <input
          id={field.input.id}
          ref={field.ref}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={typed}
          onChange={(event) => take(event.target.value)}
          aria-invalid={field.invalid || undefined}
          aria-describedby={field.error ? field.errorId : undefined}
          className="tabular-nums"
        />
      </div>
    </Shell>
  )
}
