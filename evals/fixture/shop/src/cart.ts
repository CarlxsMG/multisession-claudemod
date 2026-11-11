import { discountFor } from './coupons.ts'

export type Item = { sku: string; price: number; quantity: number }

const TAX = 0.21

export function subtotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
}

export function priceCart(items: Item[], coupon?: string) {
  const before = subtotal(items)
  const tax = Math.round(before * TAX * 100) / 100
  const discount = discountFor(coupon, before + tax)
  return { subtotal: before, tax, discount, total: before + tax - discount }
}
