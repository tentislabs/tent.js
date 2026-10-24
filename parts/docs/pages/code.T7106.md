# T7106 model-refused

The model refused for what was asked: its server said so in the answer. The call fails with the status 500, and is given to no second model, since another one would be asked the same thing.

## The fix

Ask for something else, or word the request otherwise. Code that wants another answer catches the error and asks again.

```ts
const text = await writer.reply(prompt).catch((error) => (error.code === 'T7106' ? 'I cannot help with that.' : Promise.reject(error)))
```

## See also

`word.model`, `code.T7104`
