# T7107 answer-cut-off

The answer of the model was cut off: its server said that it ended because it reached its length. The call fails with the status 500, and is given to no second model.

## Details

Of a `stream` with a `shape`, the parts that were given before it stay given, and the stream ends with this code.

## The fix

Ask for a shorter answer, or give the model more room through its `options`, in the words of its provider.

```ts
export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY'), options: { max_tokens: 16000 } })
```

## See also

`option.model.options`, `word.model`
