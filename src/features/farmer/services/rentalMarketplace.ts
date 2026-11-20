import { requireSupabase } from '../../../lib/supabase'
import { discountedPrice, type DiscountType } from '../../equipment-owner/equipment/equipmentPricing'

export interface RentalEquipment {
  id: string; owner_id: string; name: string; equipment_type: string; description: string | null
  pricing_model: string | null; price_per_unit: number; location: string | null; image_url: string | null
  brand: string | null; model: string | null; manufacturing_year: number | null
  price_per_hour: number | null; price_per_day: number | null
  discount_type: DiscountType; discount_percentage: number | null; discount_amount: number | null
  service_area: string | null; specifications: Record<string, string> | null
  equipment_capacity: string | null; fuel_type: string | null; equipment_condition: string | null
  security_deposit: number; additional_charges: number; operator_available: boolean
  terms_and_conditions: string | null; available_from: string | null; available_until: string | null
  delivery_available: boolean; pickup_available: boolean
  is_available: boolean; listing_status: 'draft' | 'active'
  photos: string[]; owner_name: string; owner_avatar: string | null; rating: number; review_count: number
}
export interface RentalEquipmentCartItem { id: string; equipment_id: string; quantity: number; equipment: RentalEquipment }
export type RentalPeriod = 'hour' | 'day' | 'month' | 'year'

const LISTING_FIELDS = 'id,owner_id,name,equipment_type,description,pricing_model,price_per_unit,location,image_url,brand,model,manufacturing_year,price_per_hour,price_per_day,discount_type,discount_percentage,discount_amount,service_area,specifications,equipment_capacity,fuel_type,equipment_condition,security_deposit,additional_charges,operator_available,terms_and_conditions,available_from,available_until,delivery_available,pickup_available,is_available,listing_status'
const COMPATIBLE_LISTING_FIELDS = 'id,owner_id,name,equipment_type,description,pricing_model,price_per_unit,location,image_url,is_available,created_at'
const LEGACY_LISTING_FIELDS = 'id,owner_id,name,category,description,rate_unit,rate_paise,city,image_url,status,created_at'
export const rentalRate = (item: RentalEquipment, period: RentalPeriod, discounted = true) => {
  const day = Number(item.price_per_day || (/day/i.test(item.pricing_model ?? '') ? item.price_per_unit : 0))
  const hour = Number(item.price_per_hour || (/hour/i.test(item.pricing_model ?? '') ? item.price_per_unit : 0))
  const original = period === 'hour' ? hour : period === 'day' ? day : day * (period === 'month' ? 30 : 365)
  return discounted ? discountedPrice(original, item.discount_type || 'none', item.discount_percentage, item.discount_amount) : original
}
export const rentalDurationUnits = (start: string, end: string, period: RentalPeriod) => {
  const from = new Date(start).getTime(), to = new Date(end).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0
  const unitMs = period === 'hour' ? 3_600_000 : period === 'day' ? 86_400_000 : period === 'month' ? 30 * 86_400_000 : 365 * 86_400_000
  return Math.max(1, Math.ceil((to - from) / unitMs))
}
export const rentalDiscountPercent = (item: RentalEquipment) => {
  const original = rentalRate(item, 'hour', false) || rentalRate(item, 'day', false)
  const sale = rentalRate(item, 'hour') || rentalRate(item, 'day')
  return original > 0 ? Math.round((original - sale) / original * 100) : 0
}
export const money = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(amount) || 0)
export const cartChanged = () => window.dispatchEvent(new Event('farmer-rental-cart-changed'))

export async function getRentals(): Promise<RentalEquipment[]> {
  const client = requireSupabase()
  let data: Record<string, unknown>[] | null = null
  const fullResult = await client.from('equipment').select(LISTING_FIELDS).eq('is_available', true).eq('listing_status', 'active').order('created_at', { ascending: false }).limit(60)
  if (!fullResult.error) data = (fullResult.data ?? []) as unknown as Record<string, unknown>[]
  else {
    // The Farmer catalog should still load if the optional marketplace migration
    // has not reached this Supabase project yet. Keep querying the real equipment
    // table; progressively fall back to the normalized and then legacy columns.
    const compatibleResult = await client.from('equipment').select(COMPATIBLE_LISTING_FIELDS).eq('is_available', true).order('created_at', { ascending: false }).limit(60)
    if (!compatibleResult.error) data = (compatibleResult.data ?? []) as unknown as Record<string, unknown>[]
    else {
      const legacyResult = await client.from('equipment').select(LEGACY_LISTING_FIELDS).order('created_at', { ascending: false }).limit(60)
      if (legacyResult.error) throw new Error(`Equipment query failed (${legacyResult.error.code || 'Supabase'}): ${legacyResult.error.message}`)
      data = (legacyResult.data ?? []).filter((row) => !['unavailable','inactive','rejected','deleted'].includes(String(row.status ?? '').toLowerCase())).map((row) => ({
        id: row.id, owner_id: row.owner_id, name: row.name, equipment_type: row.category || 'Farm equipment',
        description: row.description, pricing_model: row.rate_unit || 'day', price_per_unit: Number(row.rate_paise || 0) / 100,
        location: row.city, image_url: row.image_url, is_available: true, listing_status: 'active',
        price_per_hour: /hour/i.test(String(row.rate_unit ?? '')) ? Number(row.rate_paise || 0) / 100 : null,
        price_per_day: /day/i.test(String(row.rate_unit ?? '')) ? Number(row.rate_paise || 0) / 100 : null,
      })) as unknown as Record<string, unknown>[]
    }
  }
  const rows = (data ?? []).map((row) => ({
    ...row,
    equipment_type: row.equipment_type || 'Farm equipment',
    price_per_unit: Number(row.price_per_unit || 0),
    price_per_hour: row.price_per_hour == null ? (/hour/i.test(String(row.pricing_model ?? '')) ? Number(row.price_per_unit || 0) : null) : Number(row.price_per_hour),
    price_per_day: row.price_per_day == null ? (/day/i.test(String(row.pricing_model ?? '')) ? Number(row.price_per_unit || 0) : null) : Number(row.price_per_day),
    discount_type: row.discount_type || 'none', discount_percentage: row.discount_percentage == null ? null : Number(row.discount_percentage), discount_amount: row.discount_amount == null ? null : Number(row.discount_amount),
    brand: row.brand ?? null, model: row.model ?? null, manufacturing_year: row.manufacturing_year == null ? null : Number(row.manufacturing_year),
    service_area: row.service_area ?? null, specifications: row.specifications ?? {}, equipment_capacity: row.equipment_capacity ?? null, fuel_type: row.fuel_type ?? null, equipment_condition: row.equipment_condition ?? null,
    security_deposit: Number(row.security_deposit || 0), additional_charges: Number(row.additional_charges || 0), operator_available: Boolean(row.operator_available), terms_and_conditions: row.terms_and_conditions ?? null,
    available_from: row.available_from ?? null, available_until: row.available_until ?? null, delivery_available: Boolean(row.delivery_available), pickup_available: row.pickup_available !== false,
    is_available: row.is_available !== false, listing_status: row.listing_status || 'active',
  })) as unknown as Omit<RentalEquipment, 'photos' | 'owner_name' | 'owner_avatar' | 'rating' | 'review_count'>[]
  if (!rows.length) return []
  const ids = rows.map((row) => row.id)
  const owners = [...new Set(rows.map((row) => row.owner_id))]
  const [photoResult, ownerResult, reviewResult] = await Promise.all([
    client.from('equipment_photos').select('equipment_id,image_url,is_primary,sort_order').in('equipment_id', ids).order('sort_order'),
    client.from('equipment_owner_public_profiles').select('id,full_name,avatar_path').in('id', owners),
    client.from('reviews').select('equipment_id,rating').in('equipment_id', ids),
  ])
  // Photos, public owner profiles and reviews are enhancements. Missing views or
  // columns from a not-yet-applied migration must not hide otherwise valid listings.
  const ownerMap = new Map((ownerResult.error ? [] : ownerResult.data ?? []).map((owner) => [owner.id, owner]))
  const photos = new Map<string, { url: string; primary: boolean; order: number }[]>()
  for (const photo of (photoResult.error ? [] : photoResult.data ?? [])) photos.set(photo.equipment_id, [...(photos.get(photo.equipment_id) ?? []), { url: photo.image_url, primary: photo.is_primary, order: photo.sort_order }])
  const reviews = new Map<string, number[]>()
  for (const review of (reviewResult.error ? [] : reviewResult.data ?? [])) if (review.equipment_id) reviews.set(review.equipment_id, [...(reviews.get(review.equipment_id) ?? []), Number(review.rating)])
  return rows.map((row) => {
    const owner = ownerMap.get(row.owner_id)
    const ratings = reviews.get(row.id) ?? []
    const imageList = (photos.get(row.id) ?? []).sort((a, b) => Number(b.primary) - Number(a.primary) || a.order - b.order).map((photo) => photo.url)
    return { ...row, photos: imageList.length ? imageList : row.image_url ? [row.image_url] : [], owner_name: owner?.full_name || 'Equipment owner', owner_avatar: owner?.avatar_path ? client.storage.from('avatars').getPublicUrl(owner.avatar_path).data.publicUrl : null, rating: ratings.length ? ratings.reduce((sum, score) => sum + score, 0) / ratings.length : 0, review_count: ratings.length } as RentalEquipment
  })
}

export async function getRental(id: string): Promise<RentalEquipment | null> {
  // Use the same compatibility-aware catalog query as the home page. The
  // previous detail lookup required optional columns and views from a newer
  // migration, so a listing could appear on the home page but fail at checkout.
  const rows = await getRentals()
  return rows.find((row) => row.id === id) ?? null
}
export async function getCart(userId: string) {
  const { data, error } = await requireSupabase().from('farmer_equipment_cart_items').select('id,equipment_id,quantity').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) throw error
  const items = data ?? []
  const listings = await getRentals()
  return items.flatMap((row) => {
    const equipment = listings.find((item) => item.id === row.equipment_id)
    return equipment ? [{ ...row, equipment }] : []
  })
}
export async function addToCart(userId: string, equipmentId: string) {
  const client = requireSupabase()
  const { data: current, error: loadError } = await client.from('farmer_equipment_cart_items').select('quantity').eq('user_id', userId).eq('equipment_id', equipmentId).maybeSingle()
  if (loadError) throw loadError
  const { error } = await client.from('farmer_equipment_cart_items').upsert({ user_id: userId, equipment_id: equipmentId, quantity: Math.min(10, Number(current?.quantity ?? 0) + 1) }, { onConflict: 'user_id,equipment_id' })
  if (error) throw error
  cartChanged()
}
export async function removeFromCart(id: string) {
  const { error } = await requireSupabase().from('farmer_equipment_cart_items').delete().eq('id', id)
  if (error) throw error
  cartChanged()
}
