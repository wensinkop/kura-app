// Map raw Supabase auth errors to friendly, localised copy. Supabase returns
// English technical strings ("Invalid login credentials"); showing those defeats
// the Indonesia-first i18n effort and reads poorly to a non-technical user. We
// match on the known message/status and fall back to a generic line.
export function friendlyAuthError(error, t) {
  if (!error) return ''
  const msg = (error.message || '').toLowerCase()
  const status = error.status

  if (status === 429 || msg.includes('rate limit') || msg.includes('for security purposes') || msg.includes('only request this after')) {
    return t('auth.errRate')
  }
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) return t('auth.errInvalidLogin')
  if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('already been registered')) {
    return t('auth.errEmailTaken')
  }
  if (msg.includes('not confirmed') || msg.includes('email not confirmed')) return t('auth.errEmailNotConfirmed')
  if (msg.includes('token') && (msg.includes('expired') || msg.includes('invalid'))) return t('auth.errInvalidCode')
  if (msg.includes('expired') || msg.includes('invalid otp')) return t('auth.errInvalidCode')

  return t('auth.errGeneric')
}
