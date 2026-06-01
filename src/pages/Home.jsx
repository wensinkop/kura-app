import Placeholder from '../components/Placeholder'
import { HomeIcon } from '../lib/icons'

export default function Home() {
  return (
    <Placeholder
      icon={<HomeIcon />}
      title="Your month at a glance"
      chunk="Coming in Chunk 2"
    >
      This is where each day’s transactions and your monthly income, expenses and net total will
      appear. The foundation is ready — entry and the month view come next.
    </Placeholder>
  )
}
