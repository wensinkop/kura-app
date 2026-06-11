// Single source of truth for Premium entitlement.
//
// Premium is COMPUTED from the profile's source fields (added in the Session-17
// pricing migration) — never stored as a single flag — so trial expiry,
// subscription renewal, lifetime, and manual admin grants all resolve here.
// Wire every gate through `isPremium(profile)`; do not check `subscription_tier`
// directly elsewhere.
//
// A user is Premium if ANY of:
//   - lifetime              → bought the Founding Lifetime Deal
//   - subscription_tier ==='premium' → manual/admin grant (legacy + admin area)
//   - subscription active   → subscription_expires_at is in the future (Play/App Store)
//   - trial active          → trial_ends_at is in the future (30-day new-signup trial)

const DAY_MS = 86_400_000

function future(ts, now) {
  return !!ts && new Date(ts).getTime() > now
}

export function isPremium(profile, now = Date.now()) {
  if (!profile) return false
  return (
    profile.lifetime === true ||
    profile.subscription_tier === 'premium' ||
    future(profile.subscription_expires_at, now) ||
    future(profile.trial_ends_at, now)
  )
}

// True only when Premium is currently coming *from the trial* (not lifetime /
// paid sub / manual). Used to show the trial countdown + conversion nudges.
export function isOnTrial(profile, now = Date.now()) {
  if (!profile) return false
  if (profile.lifetime === true) return false
  if (profile.subscription_tier === 'premium') return false
  if (future(profile.subscription_expires_at, now)) return false
  return future(profile.trial_ends_at, now)
}

// Whole days remaining on the trial (0 if none / expired). Ceil so "a few hours
// left" still reads as "1 day".
export function trialDaysLeft(profile, now = Date.now()) {
  if (!profile?.trial_ends_at) return 0
  const ms = new Date(profile.trial_ends_at).getTime() - now
  return ms > 0 ? Math.ceil(ms / DAY_MS) : 0
}

// How the user's Premium is sourced, for display/analytics. Returns one of
// 'lifetime' | 'subscription' | 'manual' | 'trial' | 'free'.
export function planSource(profile, now = Date.now()) {
  if (!profile) return 'free'
  if (profile.lifetime === true) return 'lifetime'
  if (future(profile.subscription_expires_at, now)) return 'subscription'
  if (profile.subscription_tier === 'premium') return 'manual'
  if (future(profile.trial_ends_at, now)) return 'trial'
  return 'free'
}
