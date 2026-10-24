# T2012 vector-of-another-model

A value is searched with or written to a vector column that states a model, and the value states another model. Vectors of two models cannot be compared, and nothing in a list of numbers says which model made it.

## Details

Two cases. The type of the value states another model: an input that is declared `vector({ size, model })` with a model of another provider or another name. Or a `run` that was read hands the column what the `embed` of another model answered. Two types state the same model when its provider and its name are the same, whatever the definitions are called. A side that states no model is held to none.

## The fix

Make the value with the model that the column states: `embedder.embed(text)`, where `embedder` is the model of the column. Where both models do make the same vectors, state the model of the column on the type of the value.

## See also

`word.vector`, `option.vector.model`, `word.model`, `code.T2008`
