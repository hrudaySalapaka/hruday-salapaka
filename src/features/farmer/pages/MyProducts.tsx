import { WorkspacePage } from '../../WorkspacePage'
export default function MyProducts() { return <WorkspacePage path="/farmer/products" title="My products" table="products" roles={['Farmer']} description="Manage your produce listings, pricing and stock." /> }
