import { priceCart } from './cart.ts'
import type { Item } from './cart.ts'

const orders: { id: number; customer: string; total: number }[] = []

export function saveOrder(customer: string, items: Item[], coupon?: string) {
  const { total } = priceCart(items, coupon)
  const order = { id: orders.length + 1, customer, total: Number(total.toFixed(1)) }
  orders.push(order)
  return order
}

export function ordersOf(customer: string) {
  return orders.filter(order => order.customer == customer)
}
