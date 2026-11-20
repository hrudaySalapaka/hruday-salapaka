import { requireSupabase } from '../../../lib/supabase'
import type { EquipmentDraft, EquipmentPhoto, OwnerEquipment } from './equipmentTypes'

const EQUIPMENT_FIELDS = 'id,owner_id,name,equipment_type,description,pricing_model,price_per_unit,location,image_url,is_available,is_used,brand,model,manufacturing_year,price_per_hour,price_per_day,discount_type,discount_percentage,discount_amount,state,district,village,pickup_location,service_area,max_delivery_distance_km,specifications,equipment_capacity,fuel_type,equipment_condition,security_deposit,additional_charges,operator_available,terms_and_conditions,listing_status,available_from,available_until,operating_hours,delivery_available,pickup_available,created_at,updated_at'
const PHOTO_BUCKET = 'catalog-media'

function storagePathFromPublicUrl(imageUrl: string): string | undefined {
  try {
    const pathname = new URL(imageUrl).pathname
    const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`
    const position = pathname.indexOf(marker)
    return position >= 0 ? decodeURIComponent(pathname.slice(position + marker.length)) : undefined
  } catch { return undefined }
}

function normalizedEquipment(row: Omit<OwnerEquipment, 'photos'>, photos: EquipmentPhoto[]): OwnerEquipment {
  const selected = photos.length ? photos : row.image_url ? [{ image_url: row.image_url, storage_path: storagePathFromPublicUrl(row.image_url), is_primary: true, sort_order: 0 }] : []
  const normalizedPhotos = selected.some((photo) => photo.is_primary) ? selected : selected.map((photo, index) => ({ ...photo, is_primary: index === 0 }))
  return { ...row, photos: normalizedPhotos }
}

export const equipmentService = {
  async list(ownerId: string): Promise<OwnerEquipment[]> {
    const client = requireSupabase()
    const { data, error } = await client.from('equipment').select(EQUIPMENT_FIELDS).eq('owner_id', ownerId).order('created_at', { ascending: false })
    if (error) throw error
    const rows = (data ?? []) as unknown as Omit<OwnerEquipment, 'photos'>[]
    if (!rows.length) return []
    const { data: photoData, error: photoError } = await client.from('equipment_photos').select('id,equipment_id,owner_id,storage_path,image_url,is_primary,sort_order').eq('owner_id', ownerId).in('equipment_id', rows.map((row) => row.id)).order('sort_order')
    if (photoError) throw photoError
    const photosByEquipment = new Map<string, EquipmentPhoto[]>()
    for (const photo of (photoData ?? []) as unknown as (EquipmentPhoto & { equipment_id: string })[]) {
      photosByEquipment.set(photo.equipment_id, [...(photosByEquipment.get(photo.equipment_id) ?? []), photo])
    }
    return rows.map((row) => normalizedEquipment(row, photosByEquipment.get(row.id) ?? []))
  },

  async get(ownerId: string, equipmentId: string): Promise<OwnerEquipment> {
    const client = requireSupabase()
    const { data, error } = await client.from('equipment').select(EQUIPMENT_FIELDS).eq('id', equipmentId).eq('owner_id', ownerId).single()
    if (error) throw error
    const row = data as unknown as Omit<OwnerEquipment, 'photos'>
    const { data: photoData, error: photoError } = await client.from('equipment_photos').select('id,owner_id,storage_path,image_url,is_primary,sort_order').eq('equipment_id', equipmentId).eq('owner_id', ownerId).order('sort_order')
    if (photoError) throw photoError
    return normalizedEquipment(row, (photoData ?? []) as unknown as EquipmentPhoto[])
  },

  async save(ownerId: string, draft: EquipmentDraft, existing: OwnerEquipment | null, onUploadProgress: (finished: number, total: number) => void, mode: 'draft' | 'active' = 'active'): Promise<string> {
    const client = requireSupabase()
    const id = existing?.id ?? crypto.randomUUID()
    const uploaded: EquipmentPhoto[] = []
    const records: (EquipmentPhoto & { owner_id: string; equipment_id: string })[] = []
    let equipmentSaved = false
    const toRemove = (existing?.photos ?? []).filter((photo) => (photo.id || photo.storage_path) && !draft.photos.some((candidate) => photo.id ? candidate.id === photo.id : candidate.storage_path === photo.storage_path))
    try {
      const newPhotos = draft.photos.filter((photo) => photo.file)
      let finished = 0
      for (const photo of newPhotos) {
        const file = photo.file!
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
        const storagePath = `${ownerId}/equipment/${id}/${crypto.randomUUID()}-${safeName}`
        const inferredType = /\.jpe?g$/i.test(file.name) ? 'image/jpeg' : /\.png$/i.test(file.name) ? 'image/png' : /\.webp$/i.test(file.name) ? 'image/webp' : file.type
        const { error: uploadError } = await client.storage.from(PHOTO_BUCKET).upload(storagePath, file, { contentType: inferredType, upsert: false })
        if (uploadError) throw uploadError
        const imageUrl = client.storage.from(PHOTO_BUCKET).getPublicUrl(storagePath).data.publicUrl
        const savedPhoto: EquipmentPhoto = { id: undefined, storage_path: storagePath, image_url: imageUrl, is_primary: photo.is_primary, sort_order: photo.sort_order }
        uploaded.push(savedPhoto)
        records.push({ ...savedPhoto, owner_id: ownerId, equipment_id: id })
        finished += 1
        onUploadProgress(finished, newPhotos.length)
      }
      const allPhotos = draft.photos.map((photo) => photo.file ? uploaded[newPhotos.indexOf(photo)] : photo)
      const primary = allPhotos.find((photo) => photo.is_primary) ?? allPhotos[0]
      if (!primary && mode === 'active') throw new Error('Choose at least one equipment cover photo.')
      const equipmentPayload = {
        name: draft.name.trim(), equipment_type: draft.equipment_type, category: draft.equipment_type, description: draft.description.trim(),
        brand: draft.brand.trim() || null, model: draft.model.trim() || null, manufacturing_year: draft.manufacturing_year,
        pricing_model: draft.price_per_hour > 0 ? 'hour' : 'day', price_per_unit: draft.price_per_hour || draft.price_per_day || 0,
        rate_paise: Math.round((draft.price_per_hour || draft.price_per_day || 0) * 100), rate_unit: draft.price_per_hour > 0 ? 'hour' : 'day',
        price_per_hour: draft.price_per_hour || null, price_per_day: draft.price_per_day || null,
        discount_type: draft.discount_type, discount_percentage: draft.discount_type === 'percentage' ? draft.discount_percentage : null,
        discount_amount: draft.discount_type === 'amount' ? draft.discount_amount : null,
        state: draft.state.trim(), district: draft.district.trim(), village: draft.village.trim(),
        pickup_location: draft.pickup_location.trim(), location: draft.pickup_location.trim() || draft.village.trim(),
        service_area: draft.service_area.trim(), max_delivery_distance_km: draft.max_delivery_distance_km,
        specifications: draft.specifications, equipment_capacity: draft.equipment_capacity || null, fuel_type: draft.fuel_type || null, equipment_condition: draft.equipment_condition || null,
        security_deposit: draft.security_deposit, additional_charges: draft.additional_charges, operator_available: draft.operator_available, terms_and_conditions: draft.terms_and_conditions || null,
        listing_status: mode, is_available: mode === 'active' && draft.is_available, is_used: existing?.is_used ?? false,
        available_from: draft.available_from || null, available_until: draft.available_until || null,
        operating_hours: draft.operating_hours.trim() || null, delivery_available: draft.delivery_available,
        pickup_available: draft.pickup_available, image_url: primary?.image_url ?? null, updated_at: new Date().toISOString(),
      }
      const saveResult = existing
        ? await client.from('equipment').update(equipmentPayload).eq('id', id).eq('owner_id', ownerId).select('id').single()
        : await client.from('equipment').insert({ id, owner_id: ownerId, ...equipmentPayload }).select('id').single()
      if (saveResult.error) throw saveResult.error
      equipmentSaved = true

      if (records.length) {
        const { error: insertPhotosError } = await client.from('equipment_photos').insert(records.map(({ id: _id, ...record }) => record))
        if (insertPhotosError) throw insertPhotosError
      }
      const keptExisting = allPhotos.filter((photo) => photo.id)
      for (const photo of keptExisting) {
        const { error: updatePhotoError } = await client.from('equipment_photos').update({ is_primary: photo.is_primary, sort_order: photo.sort_order }).eq('id', photo.id!).eq('owner_id', ownerId)
        if (updatePhotoError) throw updatePhotoError
      }
      if (toRemove.length) {
        const photoIds = toRemove.map((photo) => photo.id).filter((value): value is string => Boolean(value))
        if (photoIds.length) {
          const { error: deletePhotosError } = await client.from('equipment_photos').delete().in('id', photoIds).eq('owner_id', ownerId)
          if (deletePhotosError) throw deletePhotosError
        }
      }
      const removedPaths = toRemove.map((photo) => photo.storage_path).filter((path): path is string => Boolean(path))
      if (removedPaths.length) await client.storage.from(PHOTO_BUCKET).remove(removedPaths)
      return id
    } catch (reason) {
      if (uploaded.length) await client.from('equipment_photos').delete().in('storage_path', uploaded.map((photo) => photo.storage_path!)).eq('owner_id', ownerId)
      if (uploaded.length) await client.storage.from(PHOTO_BUCKET).remove(uploaded.map((photo) => photo.storage_path!))
      if (equipmentSaved && existing) {
        await client.from('equipment').update({
          name: existing.name, equipment_type: existing.equipment_type, category: existing.equipment_type, description: existing.description,
          pricing_model: existing.pricing_model, price_per_unit: existing.price_per_unit, location: existing.location,
          rate_paise: Math.round(Number(existing.price_per_unit || 0) * 100), rate_unit: /hour/i.test(existing.pricing_model ?? '') ? 'hour' : 'day',
          image_url: existing.image_url, is_available: existing.is_available, is_used: existing.is_used,
          brand: existing.brand, model: existing.model, manufacturing_year: existing.manufacturing_year,
          price_per_hour: existing.price_per_hour, price_per_day: existing.price_per_day,
          discount_type: existing.discount_type, discount_percentage: existing.discount_percentage, discount_amount: existing.discount_amount,
          state: existing.state, district: existing.district, village: existing.village, pickup_location: existing.pickup_location,
          service_area: existing.service_area, max_delivery_distance_km: existing.max_delivery_distance_km,
          specifications: existing.specifications, available_from: existing.available_from, available_until: existing.available_until,
          equipment_capacity: existing.equipment_capacity, fuel_type: existing.fuel_type, equipment_condition: existing.equipment_condition,
          security_deposit: existing.security_deposit, additional_charges: existing.additional_charges, operator_available: existing.operator_available,
          terms_and_conditions: existing.terms_and_conditions, listing_status: existing.listing_status,
          operating_hours: existing.operating_hours, delivery_available: existing.delivery_available, pickup_available: existing.pickup_available,
        }).eq('id', id).eq('owner_id', ownerId)
        for (const photo of existing.photos.filter((candidate) => candidate.id)) {
          await client.from('equipment_photos').update({ is_primary: photo.is_primary, sort_order: photo.sort_order }).eq('id', photo.id!).eq('owner_id', ownerId)
        }
      } else if (equipmentSaved) await client.from('equipment').delete().eq('id', id).eq('owner_id', ownerId)
      throw reason
    }
  },

  async remove(ownerId: string, equipment: OwnerEquipment): Promise<void> {
    const client = requireSupabase()
    const { error } = await client.from('equipment').delete().eq('id', equipment.id).eq('owner_id', ownerId)
    if (error) {
      if (error.code === '23503') throw new Error('This equipment has booking records and cannot be deleted. Mark it unavailable instead.')
      throw error
    }
    const paths = equipment.photos.map((photo) => photo.storage_path).filter((path): path is string => Boolean(path))
    if (paths.length) await client.storage.from(PHOTO_BUCKET).remove(paths)
  },
}
