import Placeholder from '../components/Placeholder'
import { StatsIcon } from '../lib/icons'

export default function Stats() {
  return (
    <Placeholder
      icon={<StatsIcon />}
      title="Statistics"
      chunk="Coming in Chunk 4"
    >
      Weekly, monthly, yearly and custom-period breakdowns of income and expenses by category will
      live here.
    </Placeholder>
  )
}
