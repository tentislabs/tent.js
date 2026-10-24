import { anyone, number, query } from 'tentjs'

const open = anyone('a test builds it')

// A plain body that doubles a text forty times with the sign: ten million million characters, were it worked out.
export const doubles = query('doubles', {
  access: open,
  output: number(),
  run: () => {
    const seed = '0123456789'
    const t1 = seed + seed
    const t2 = t1 + t1
    const t3 = t2 + t2
    const t4 = t3 + t3
    const t5 = t4 + t4
    const t6 = t5 + t5
    const t7 = t6 + t6
    const t8 = t7 + t7
    const t9 = t8 + t8
    const t10 = t9 + t9
    const t11 = t10 + t10
    const t12 = t11 + t11
    const t13 = t12 + t12
    const t14 = t13 + t13
    const t15 = t14 + t14
    const t16 = t15 + t15
    const t17 = t16 + t16
    const t18 = t17 + t17
    const t19 = t18 + t18
    const t20 = t19 + t19
    const t21 = t20 + t20
    const t22 = t21 + t21
    const t23 = t22 + t22
    const t24 = t23 + t23
    const t25 = t24 + t24
    const t26 = t25 + t25
    const t27 = t26 + t26
    const t28 = t27 + t27
    const t29 = t28 + t28
    const t30 = t29 + t29
    const t31 = t30 + t30
    const t32 = t31 + t31
    const t33 = t32 + t32
    const t34 = t33 + t33
    const t35 = t34 + t34
    const t36 = t35 + t35
    const t37 = t36 + t36
    const t38 = t37 + t37
    const t39 = t38 + t38
    const t40 = t39 + t39
    return t40.length
  },
})

// The same in a body that is code, since it calls a member of a text: its module is made by the builder.
export const trims = query('trims', {
  access: open,
  output: number(),
  run: () => {
    const seed = '0123456789'
    const t1 = seed + seed
    const t2 = t1 + t1
    const t3 = t2 + t2
    const t4 = t3 + t3
    const t5 = t4 + t4
    const t6 = t5 + t5
    const t7 = t6 + t6
    const t8 = t7 + t7
    const t9 = t8 + t8
    const t10 = t9 + t9
    const t11 = t10 + t10
    const t12 = t11 + t11
    const t13 = t12 + t12
    const t14 = t13 + t13
    const t15 = t14 + t14
    const t16 = t15 + t15
    const t17 = t16 + t16
    const t18 = t17 + t17
    const t19 = t18 + t18
    const t20 = t19 + t19
    const t21 = t20 + t20
    const t22 = t21 + t21
    const t23 = t22 + t22
    const t24 = t23 + t23
    const t25 = t24 + t24
    const t26 = t25 + t25
    const t27 = t26 + t26
    const t28 = t27 + t27
    const t29 = t28 + t28
    const t30 = t29 + t29
    const t31 = t30 + t30
    const t32 = t31 + t31
    const t33 = t32 + t32
    const t34 = t33 + t33
    const t35 = t34 + t34
    const t36 = t35 + t35
    const t37 = t36 + t36
    const t38 = t37 + t37
    const t39 = t38 + t38
    const t40 = t39 + t39
    return t40.trim().length
  },
})
