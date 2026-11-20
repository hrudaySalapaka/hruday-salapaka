import { WorkspacePage } from '../WorkspacePage'
import type { WorkspaceProps } from '../WorkspacePage'

export default function CustomerDashboard(props: Omit<WorkspaceProps, 'roles'>) {
  return <WorkspacePage {...props} roles={['Customer']} />
}
