# T7011 vector-in-fill

The shape handed to `fill` holds a `vector`. The check finds it where it can see the shape.

## Details

A model fills a shape by writing its answer, and no model writes a vector. A vector is made with `embed` of a model that embeds.

## The fix

Take the vector out of the shape, and make it with `embed`.

## See also

`word.model`, `option.model.abilities`
