// Goals (#5) — pure math + presets. A goal is a target amount backed by a
// dedicated account; progress is that account's current balance. Contributions
// are transfers into the account (so they count in net worth, not as expenses).

// Preset keys → an emoji shown on the card. Labels come from i18n (goals.preset.*).
export const GOAL_PRESETS = [
  { key: 'emergency', emoji: '🛟' },
  { key: 'hajj', emoji: '🕋' },
  { key: 'house', emoji: '🏠' },
  { key: 'wedding', emoji: '💍' },
  { key: 'vacation', emoji: '🏝️' },
  { key: 'gadget', emoji: '📱' },
  { key: 'custom', emoji: '🎯' },
]
export function presetEmoji(key) {
  return GOAL_PRESETS.find((p) => p.key === key)?.emoji ?? '🎯'
}

// Progress of `saved` toward `target`. ratio can exceed 1 (over-funded); pct is
// clamped 0–100 for the ring fill.
export function goalProgress(saved, target) {
  const ratio = target > 0 ? saved / target : 0
  return {
    ratio: Math.max(0, ratio),
    pct: Math.round(Math.min(1, Math.max(0, ratio)) * 100),
    reached: target > 0 && saved >= target,
    over: target > 0 && saved > target,
  }
}

// Pacing toward a deadline: whole months left (min 1) and the per-month amount
// still needed. Null when there's no deadline or the goal is already reached.
export function goalPacing(saved, target, deadlineISO) {
  if (!deadlineISO) return null
  const remaining = Math.max(0, target - saved)
  if (remaining <= 0) return null
  const [y, m, d] = deadlineISO.split('-').map(Number)
  const deadline = new Date(y, m - 1, d)
  const now = new Date()
  const msPerMonth = 1000 * 60 * 60 * 24 * 30.44
  const overdue = deadline < now
  const months = Math.max(1, Math.ceil((deadline - now) / msPerMonth))
  return { months, perMonth: remaining / months, remaining, overdue }
}
