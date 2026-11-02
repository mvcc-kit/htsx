// Store usado no servidor e no cliente (mesmos tipos nos dois lados).
import { defineStore } from '../../store'

export interface Item { name: string; price: number; qty: number }

export const cart = defineStore('cart', {
  state: { items: [] as Item[], coupon: '' },
  derived: {
    count: s => s.items.reduce((n, i) => n + i.qty, 0),
    total: s => s.items.reduce((n, i) => n + i.price * i.qty, 0) * (s.coupon === 'DEZ' ? 0.9 : 1),
  },
  actions: {
    add: (s, item: Item) => { s.items.push(item) },
    clear: s => { s.items = [] },
  },
  effects: {
    title: s => { document.title = `Carrinho (${s.count})` },
  },
})
