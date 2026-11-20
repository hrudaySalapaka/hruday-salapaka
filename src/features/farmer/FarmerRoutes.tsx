import { Navigate, Route, Routes, useOutletContext } from 'react-router-dom'
import type { AppContextValue } from '../../types/user'
import ExploreHome from './explore/ExploreHome'
import FarmerUtilityPage from './explore/FarmerUtilityPage'
import FarmerNotifications from './pages/Notifications'
import AddProduct from './pages/AddProduct'
import DeliveryTracking from './pages/DeliveryTracking'
import Earnings from './pages/Earnings'
import MyBookings from './pages/MyBookings'
import MyCrops from './pages/MyCrops'
import MyFarm from './pages/MyFarm'
import MyOrders from './pages/MyOrders'
import MyProducts from './pages/MyProducts'
import Settings from './pages/Settings'
import Wallet from './pages/Wallet'
import FarmerProfile from './pages/Profile'
import RentalCart from './pages/RentalCart'
import RentalCheckout from './pages/RentalCheckout'
import RentalPayment from './pages/RentalPayment'
import RentalOrderSummary from './pages/RentalOrderSummary'
import RentalCheckoutSummary from './pages/RentalCheckoutSummary'
import RentalCheckoutPayment from './pages/RentalCheckoutPayment'
import EquipmentDetails from './pages/EquipmentDetails'
import FarmerServicePage from './pages/FarmerServicePage'
import { CameraChatPage, NormalChatPage, VideoCallPage, VideoChatPage, VoiceChatPage } from './assistant/AssistantPages'

export default function FarmerRoutes() {
  const { profile } = useOutletContext<AppContextValue>()
  if (profile?.role !== 'Farmer') return <Navigate to="/home" replace />
  return <Routes>
    <Route index element={<Navigate to="home" replace />} />
    <Route path="home" element={<ExploreHome />} />
    <Route path="explore" element={<ExploreHome />} />
    <Route path="farms" element={<MyFarm />} />
    <Route path="crops" element={<MyCrops />} />
    <Route path="products" element={<MyProducts />} />
    <Route path="add-product" element={<AddProduct />} />
    <Route path="equipment" element={<ExploreHome />} />
    <Route path="equipment/:equipmentId" element={<EquipmentDetails />} />
    <Route path="cart" element={<RentalCart />} />
    <Route path="checkout" element={<RentalCheckout />} />
    <Route path="checkout/summary" element={<RentalCheckoutSummary />} />
    <Route path="checkout/payment" element={<RentalCheckoutPayment />} />
    <Route path="order/:bookingId" element={<RentalOrderSummary />} />
    <Route path="payment/:bookingId" element={<RentalPayment />} />
    <Route path="bookings" element={<MyBookings />} />
    <Route path="orders" element={<MyOrders />} />
    <Route path="delivery" element={<DeliveryTracking />} />
    <Route path="earnings" element={<Earnings />} />
    <Route path="wallet" element={<Wallet />} />
    <Route path="notifications" element={<FarmerNotifications />} />
    <Route path="settings" element={<Settings />} />
    <Route path="services/:service" element={<FarmerServicePage />} />
    <Route path="support" element={<FarmerUtilityPage />} />
    <Route path="assistant/camera" element={<CameraChatPage />} />
    <Route path="assistant/voice" element={<VoiceChatPage />} />
    <Route path="assistant/video" element={<VideoChatPage />} />
    <Route path="assistant/video-call" element={<VideoCallPage />} />
    <Route path="assistant/chat" element={<NormalChatPage />} />
    <Route path="profile" element={<FarmerProfile />} />
    <Route path="*" element={<Navigate to="/farmer/home" replace />} />
  </Routes>
}
