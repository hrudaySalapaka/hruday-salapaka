import { WorkspacePage } from '../../WorkspacePage'
export default function AddProduct() { return <WorkspacePage path="/farmer/products" title="Add product" table="products" roles={['Farmer']} description="Create a produce listing for your farm." initialCreating /> }
