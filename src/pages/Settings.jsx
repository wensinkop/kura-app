import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useTheme } from '../ThemeContext'
import { useLanguage } from '../LanguageContext'
import { LANGUAGES } from '../i18n'
import { Modal } from '../components/ui'
import { formatDate, DATE_FORMAT_LABELS } from '../lib/format'

const DATE_FORMAT_KEYS = ['dmy', 'mdy', 'ymd']
const DATE_SAMPLE = '2026-12-31' // day > 12 so the order is unambiguous

function SectionTitle({ children }) {
  return (
    <div className="text-xs font-bold uppercase tracking-wide text-faint mt-5 mb-2 px-1 first:mt-0">
      {children}
    </div>
  )
}

function Group({ children }) {
  return <div className="bg-surface border border-border rounded-[14px] overflow-hidden">{children}</div>
}

function Row({ title, sub, right, onClick, disabled }) {
  const Comp = onClick && !disabled ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={`w-full flex gap-3 items-center px-3.5 py-3 border-t border-border first:border-t-0 text-left ${
        onClick && !disabled ? 'hover:bg-surface-2' : ''
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[14.5px] text-text">{title}</div>
        {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
      </div>
      {right}
    </Comp>
  )
}

function Switch({ on, onClick }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={`relative w-[46px] h-[27px] rounded-full shrink-0 transition-colors ${on ? 'bg-primary' : 'bg-border'}`}
    >
      <span className={`absolute top-[3px] w-[21px] h-[21px] rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-[3px]'}`} />
    </button>
  )
}

const Chevron = <span className="text-faint">›</span>
function Premium({ label }) {
  return <span className="text-[10px] font-bold uppercase tracking-wide text-primary border border-primary/40 rounded-full px-1.5 py-0.5">{label}</span>
}

export default function Settings() {
  const { t } = useTranslation()
  const { user, profile, role, signOut, updateProfile } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { lang, setLanguage } = useLanguage()
  const navigate = useNavigate()
  const [dateOpen, setDateOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const dateFmt = profile?.date_format ?? 'dmy'
  const budgetsOn = profile?.budgets_enabled ?? false
  const currentLang = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0]

  async function pickDateFormat(f) {
    setDateOpen(false)
    if (f !== dateFmt) await updateProfile({ date_format: f })
  }

  async function pickLanguage(code) {
    setLangOpen(false)
    if (code !== lang) await setLanguage(code)
  }

  function toggleBudgets() {
    updateProfile({ budgets_enabled: !budgetsOn })
  }

  return (
    <div className="max-w-[640px] mx-auto">
      <SectionTitle>{t('settings.account')}</SectionTitle>
      <Group>
        <Row title={profile?.full_name || t('settings.yourName')} sub={user?.email} />
        <Row title={t('settings.emailPassword')} sub={t('settings.emailPasswordSub')} right={Chevron} onClick={() => navigate('/settings/account')} />
      </Group>

      <SectionTitle>{t('settings.appearance')}</SectionTitle>
      <Group>
        <Row
          title={t('settings.darkMode')}
          sub={t('settings.darkModeSub')}
          right={<Switch on={theme === 'dark'} onClick={toggleTheme} />}
        />
      </Group>

      <SectionTitle>{t('settings.preferences')}</SectionTitle>
      <Group>
        <Row
          title={t('settings.language')}
          sub={t('settings.languageSub')}
          right={<span className="flex items-center gap-1.5"><span className="text-faint font-semibold">{currentLang.label}</span>{Chevron}</span>}
          onClick={() => setLangOpen(true)}
        />
        <Row
          title={t('settings.baseCurrency')}
          sub={t('settings.baseCurrencySub')}
          right={<span className="text-faint font-semibold">{profile?.base_currency ?? 'IDR'}</span>}
        />
        <Row
          title={t('settings.dateFormat')}
          sub={t('settings.dateFormatSub')}
          right={<span className="flex items-center gap-1.5"><span className="text-faint font-semibold tabular">{formatDate(DATE_SAMPLE, dateFmt)}</span>{Chevron}</span>}
          onClick={() => setDateOpen(true)}
        />
        <Row
          title={t('settings.exchangeRates')}
          sub={t('settings.exchangeRatesSub')}
          right={Chevron}
          onClick={() => navigate('/settings/rates')}
        />
        <Row
          title={t('settings.budgets')}
          sub={t('settings.budgetsSub')}
          right={<Switch on={budgetsOn} onClick={toggleBudgets} />}
        />
        {budgetsOn && (
          <Row title={t('settings.openBudgets')} sub={t('settings.openBudgetsSub')} right={Chevron} onClick={() => navigate('/budget')} />
        )}
      </Group>

      <SectionTitle>{t('settings.structure')}</SectionTitle>
      <Group>
        <Row title={t('settings.categories')} sub={t('settings.categoriesSub')} right={Chevron} onClick={() => navigate('/settings/categories')} />
        <Row title={t('settings.accountsGroups')} sub={t('settings.accountsGroupsSub')} right={Chevron} onClick={() => navigate('/settings/accounts')} />
      </Group>

      <SectionTitle>{t('settings.data')}</SectionTitle>
      <Group>
        <Row title={t('settings.backupData')} sub={t('settings.backupDataSub')} right={Chevron} onClick={() => navigate('/settings/data')} />
        <Row title={t('settings.bankStatement')} sub={t('settings.bankStatementSub')} right={<span className="flex items-center gap-1.5"><Premium label={t('common.premium')} />{Chevron}</span>} onClick={() => navigate('/import/statement')} />
      </Group>

      <SectionTitle>{t('settings.aboutLegal')}</SectionTitle>
      <Group>
        <Row title={t('settings.help')} sub={t('settings.helpSub')} right={Chevron} onClick={() => navigate('/help')} />
        <Row title={t('settings.privacy')} sub={t('settings.privacySub')} right={Chevron} onClick={() => navigate('/legal/privacy')} />
        <Row title={t('settings.terms')} sub={t('settings.termsSub')} right={Chevron} onClick={() => navigate('/legal/terms')} />
      </Group>

      {role === 'admin' && (
        <>
          <SectionTitle>{t('settings.admin')}</SectionTitle>
          <Group>
            <Row title={t('settings.users')} sub={t('settings.usersSub')} right={Chevron} onClick={() => navigate('/admin')} />
            <Row title={t('settings.legalContent')} sub={t('settings.legalContentSub')} right={Chevron} onClick={() => navigate('/admin/content')} />
          </Group>
        </>
      )}

      <div className="mt-5">
        <Group>
          <Row title={t('settings.signOut')} onClick={signOut} right={Chevron} />
        </Group>
      </div>

      <p className="text-center text-xs text-faint pt-6 pb-1.5">Kura · {t('settings.tagline')} 🐢</p>
      <p className="text-center text-[11px] text-faint pb-6">v1.0.0 · build {import.meta.env.VITE_BUILD_ID}</p>

      {langOpen && (
        <Modal title={t('settings.languageModalTitle')} onClose={() => setLangOpen(false)}>
          <div className="space-y-2">
            {LANGUAGES.map((l) => {
              const active = l.code === lang
              return (
                <button
                  key={l.code}
                  onClick={() => pickLanguage(l.code)}
                  className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left ${
                    active ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface-2'
                  }`}
                >
                  <span className="font-semibold text-[14.5px] text-text flex items-center gap-2">
                    {l.label}
                    {l.beta && <span className="text-[10px] font-bold uppercase tracking-wide text-muted border border-border rounded-full px-1.5 py-0.5">{t('common.beta')}</span>}
                  </span>
                  {active && <span className="text-primary font-bold shrink-0">✓</span>}
                </button>
              )
            })}
          </div>
        </Modal>
      )}

      {dateOpen && (
        <Modal title={t('settings.dateFormatModalTitle')} onClose={() => setDateOpen(false)}>
          <div className="space-y-2">
            {DATE_FORMAT_KEYS.map((k) => {
              const active = k === dateFmt
              return (
                <button
                  key={k}
                  onClick={() => pickDateFormat(k)}
                  className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left ${
                    active ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface-2'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-[14.5px] text-text">{DATE_FORMAT_LABELS[k]}</span>
                    <span className="block text-xs text-muted tabular mt-0.5">{formatDate(DATE_SAMPLE, k)}</span>
                  </span>
                  {active && <span className="text-primary font-bold shrink-0">✓</span>}
                </button>
              )
            })}
          </div>
        </Modal>
      )}
    </div>
  )
}
