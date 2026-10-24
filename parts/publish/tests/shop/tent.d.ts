import type {} from 'tentjs'
declare module 'tentjs' {
  interface Tables {
    clients: typeof import('./tables/orders').clients
    orders: typeof import('./tables/orders').orders
  }
  interface Functions {
    addOrder: typeof import('./functions/orders').addOrder
    openOrders: typeof import('./functions/orders').openOrders
    refund: typeof import('./functions/orders').refund
  }
  interface Flows {
    approval: typeof import('./flows/approval').approval
    followUp: typeof import('./flows/follow').followUp
    moving: typeof import('./flows/approval').moving
  }
  interface Services {}
  interface Models {}
  interface Settings {}
}
