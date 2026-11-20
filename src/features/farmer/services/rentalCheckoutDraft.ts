export interface RentalCheckoutDraft {
  userId: string; equipmentId: string; address: string; village: string; district: string; state: string; pin: string;
  start: string; end: string; period: 'hour' | 'day' | 'month' | 'year'; delivery: boolean;
  bookingId?: string;
}
const key = (userId: string) => `khetigo:rental-checkout:${userId}`
export function saveRentalCheckoutDraft(draft: RentalCheckoutDraft) { sessionStorage.setItem(key(draft.userId), JSON.stringify(draft)) }
export function loadRentalCheckoutDraft(userId: string): RentalCheckoutDraft | null {
  try { const value = sessionStorage.getItem(key(userId)); if (!value) return null; const draft = JSON.parse(value) as RentalCheckoutDraft; return draft.userId === userId ? draft : null } catch { return null }
}
export function clearRentalCheckoutDraft(userId: string) { sessionStorage.removeItem(key(userId)) }
