import { Navigate, Route, Routes, useOutletContext } from 'react-router-dom'
import type { AppContextValue } from '../../../types/user'
import EquipmentListing from './EquipmentListing'
import EquipmentForm from './EquipmentForm'
import EquipmentDetails from './EquipmentDetails'

export default function EquipmentManagementRoutes() {
  const { profile } = useOutletContext<AppContextValue>()
  if (profile?.role !== 'Equipment Owner') return <Navigate to="/home" replace />
  return <Routes>
    <Route index element={<EquipmentListing />} />
    <Route path="add" element={<EquipmentForm />} />
    <Route path=":equipmentId/edit" element={<EquipmentForm />} />
    <Route path=":equipmentId" element={<EquipmentDetails />} />
    <Route path="*" element={<Navigate to="/equipment-owner/equipment" replace />} />
  </Routes>
}
