import Placeholder from '../components/Placeholder'
import { AccountsIcon } from '../lib/icons'

export default function Accounts() {
  return (
    <Placeholder
      icon={<AccountsIcon />}
      title="Accounts"
      chunk="Coming in Chunk 1 & 3"
    >
      Your cash, debit and credit-card accounts, grouped with balances and net worth, will show
      here. Creating accounts comes in Chunk 1; balances and credit-card payable/outstanding in
      Chunk 3.
    </Placeholder>
  )
}
