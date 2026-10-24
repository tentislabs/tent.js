/**
 * The mark that the model layer sets on a service call that checks a long job. The checks of a job belong to the
 * place of its start, so one yes to the start covers them: a check is not asked about again. App code cannot reach
 * the mark, so it cannot pass a call off as a check.
 */
export const checkOfJob: unique symbol = Symbol('the check of a long job')
