# T7005 fallback-lacks-ability

A model in `fallback` lacks an ability of the model it stands in for. A warning of the check.

## Details

A fall-back is given a call only when it can take it: it has the ability the call needs. A call that needs an ability the fall-back lacks is passed over by it, so where the first model fails, that call fails too. The abilities of each are those the list of models gives it, or those it states in `abilities`.

## The fix

Give the model a fall-back that can do what it does, or leave it as it is where the calls that need the lacking ability may fail.

## See also

`option.model.fallback`, `option.model.abilities`, `word.model`
