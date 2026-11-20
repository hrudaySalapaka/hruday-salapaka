import { WorkspacePage } from '../../WorkspacePage'
export default function MyCrops() { return <WorkspacePage path="/farmer/crops" title="My crops" table="crops" roles={['Farmer']} description="Track crops and planned harvests for your farm." /> }
