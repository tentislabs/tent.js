# T7116 service-answer-did-not-fit

What a service answered does not fit the `output` that its call states.

## Details

A step of a flow that fails with this code is not tried again: the service would answer the same a second time.

## The fix

State an `output` on the call of the service that fits what the service answers.

## See also

`word.service`, `topic.flows`
