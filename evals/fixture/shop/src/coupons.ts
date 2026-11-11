const COUPONS: Record<string, number> = { WELCOME10: 0.1, SPRING25: 0.25 }

export function discountFor(coupon: string | undefined, amount: number): number {
  if (coupon === undefined) return 0
  return Math.floor(amount * COUPONS[coupon]!)
}
