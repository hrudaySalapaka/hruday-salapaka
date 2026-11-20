import { WorkspacePage } from '../WorkspacePage'
import type { WorkspaceProps } from '../WorkspacePage'

export default function MarketSellerDashboard(props: Omit<WorkspaceProps, 'roles'>) {
  return <WorkspacePage {...props} roles={['Market Seller']} />
}
