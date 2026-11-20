import { WorkspacePage } from '../WorkspacePage'
import type { WorkspaceProps } from '../WorkspacePage'

export default function DeliveryPartnerDashboard(props: Omit<WorkspaceProps, 'roles'>) {
  return <WorkspacePage {...props} roles={['Delivery Partner']} />
}
