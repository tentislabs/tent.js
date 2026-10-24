# `setting`

Names a setting of the project, where an option of the project needs a value that may differ between test data and live data. The option holds the name, and the value is read where it is used, as it stands then.

## Example

```ts
trace: { otlp: { url: setting('otlpUrl') } }
```

## Returns

The record `{ setting: 'otlpUrl' }`, which is stored as it is. The setting itself is declared under `settings` of the project.

## See also

`option.project.settings`, `word.secret`, `option.project.trace`
