import { WorkspacePage } from '../WorkspacePage'
import type { WorkspaceProps } from '../WorkspacePage'

export default function RideBookingDashboard(props: Omit<WorkspaceProps, 'roles'>) {
  return <WorkspacePage {...props} roles={['Ride Booking Partner']} />
}
