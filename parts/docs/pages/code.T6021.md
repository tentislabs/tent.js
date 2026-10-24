# T6021 no-currency

`'currency'` is handed to `format` in place, and the project states no `currency`.

## Details

`format(value, 'currency')` of `useTranslations` shows a number as money in the currency of the project. Money is a whole number of the smallest unit, so 1999 with `'USD'` is shown as $19.99.

```tsx
const { format } = useTranslations()
return <span>{format(order.total, 'currency')}</span>   // T6021 in a project with no currency
```

## The fix

State the currency of the project, `project('shop', { currency: 'USD' })`, or name one where the value is shown: `format(order.total, { currency: 'EUR' })`.

## See also

`option.project.currency`, `hook.useTranslations`
