export type DiscountType = 'none' | 'percentage' | 'amount'

export function discountedPrice(price: number, type: DiscountType, percentage: number | null | undefined, amount: number | null | undefined): number {
  if (type === 'percentage') return Math.max(0, price * (1 - (Number(percentage) || 0) / 100))
  if (type === 'amount') return Math.max(0, price - (Number(amount) || 0))
  return price
}

export function formatINR(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0)
}
