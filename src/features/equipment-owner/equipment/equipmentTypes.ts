export interface EquipmentPhoto { id?: string; storage_path?: string; image_url: string; file?: File; is_primary: boolean; sort_order: number }

export interface OwnerEquipment {
  id: string
  owner_id: string
  name: string
  equipment_type: string
  description: string | null
  pricing_model: string | null
  price_per_unit: number
  location: string | null
  image_url: string | null
  is_available: boolean
  is_used: boolean
  brand: string | null
  model: string | null
  manufacturing_year: number | null
  price_per_hour: number | null
  price_per_day: number | null
  discount_type: 'none' | 'percentage' | 'amount'
  discount_percentage: number | null
  discount_amount: number | null
  state: string | null
  district: string | null
  village: string | null
  pickup_location: string | null
  service_area: string | null
  max_delivery_distance_km: number | null
  specifications: Record<string, string> | null
  equipment_capacity: string | null
  fuel_type: string | null
  equipment_condition: string | null
  security_deposit: number
  additional_charges: number
  operator_available: boolean
  terms_and_conditions: string | null
  listing_status: 'draft' | 'active'
  available_from: string | null
  available_until: string | null
  operating_hours: string | null
  delivery_available: boolean
  pickup_available: boolean
  created_at: string
  updated_at: string
  photos: EquipmentPhoto[]
}

export interface EquipmentDraft {
  name: string
  equipment_type: string
  brand: string
  model: string
  manufacturing_year: number | null
  description: string
  price_per_hour: number
  price_per_day: number
  discount_type: 'none' | 'percentage' | 'amount'
  discount_percentage: number | null
  discount_amount: number | null
  state: string
  district: string
  village: string
  pickup_location: string
  service_area: string
  max_delivery_distance_km: number | null
  specifications: Record<string, string>
  equipment_capacity: string
  fuel_type: string
  equipment_condition: string
  security_deposit: number
  additional_charges: number
  operator_available: boolean
  terms_and_conditions: string
  is_available: boolean
  available_from: string
  available_until: string
  operating_hours: string
  delivery_available: boolean
  pickup_available: boolean
  photos: EquipmentPhoto[]
}
