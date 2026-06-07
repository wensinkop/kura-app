import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { createAccount } from '../lib/data'
import { currencyOptions, localeFor, currencyDecimals } from '../lib/currencies'
import { Button, Field, TextInput, Segmented } from '../components/ui'
import ResponsiveSelect from '../components/ResponsiveSelect'
import NumberInput from '../components/NumberInput'
import { BrandMark } from '../components/Logo'
import { ShieldIcon, AccountsIcon, HomeIcon, UploadIcon, PlusIcon, SearchIcon } from '../lib/icons'

const CURRENCY_OPTS = currencyOptions()
const TOTAL_STEPS = 3 // welcome → currency → account (the fork isn't counted)

// First-run setup. Shown once when profiles.onboarded is false; finishing (or
// skipping) sets the flag so it never reappears. No fake/sample data — it just
// gets the user to a real base currency + first account, then forks them into
// importing, adding a transaction, or exploring.
export default function Onboarding() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, profile, updateProfile } = useAuth()

  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)

  const [currency, setCurrency] = useState(profile?.base_currency ?? 'IDR')

  const [preset, setPreset] = useState('cash')
  const [name, setName] = useState('')
  const [type, setType] = useState('cash')
  const [opening, setOpening] = useState(null)

  const firstName = (profile?.full_name || '').trim().split(/\s+/)[0]

  // Finish onboarding then go somewhere. Idempotent — always flips the flag so a
  // failed write never traps the user on this screen.
  async function finish(target) {
    setBusy(true)
    await updateProfile({ onboarded: true })
    navigate(target, { replace: true })
  }

  async function saveCurrencyAndNext() {
    setBusy(true)
    if (currency && currency !== profile?.base_currency) await updateProfile({ base_currency: currency })
    setBusy(false)
    setStep(2)
  }

  function choosePreset(key) {
    setPreset(key)
    setType(key === 'bank' || key === 'ewallet' ? 'debit' : 'cash')
    // Prefill the name with the preset label, but let the user override it.
    if (!name.trim() || ['cash', 'bank', 'ewallet'].includes(name.trim().toLowerCase())) {
      setName(t(`onboarding.preset${key === 'cash' ? 'Cash' : key === 'bank' ? 'Bank' : 'Ewallet'}`))
    }
  }

  async function createFirstAccount() {
    const nm = name.trim() || t('onboarding.presetCash')
    setBusy(true)
    await createAccount(user.id, { name: nm, type, currency, opening_balance: opening ?? 0 }, 0)
    setBusy(false)
    setStep(3)
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-bg px-5 pt-[calc(1.5rem_+_env(safe-area-inset-top))] pb-[calc(1.5rem_+_env(safe-area-inset-bottom))]">
      {/* Top bar: brand + skip */}
      <div className="flex items-center justify-between w-full max-w-md mx-auto">
        <BrandMark className="w-8 h-8" />
        {step < 3 && (
          <button onClick={() => finish('/')} disabled={busy}
            className="text-sm font-semibold text-muted hover:text-text disabled:opacity-50">
            {t('onboarding.skip')}
          </button>
        )}
      </div>

      {/* Progress dots (welcome/currency/account; the fork is the destination) */}
      {step < 3 && (
        <div className="flex items-center justify-center gap-1.5 mt-5 w-full max-w-md mx-auto">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-primary' : 'w-1.5 bg-border'}`} />
          ))}
        </div>
      )}

      <div className="flex-1 flex flex-col justify-center w-full max-w-md mx-auto py-6">
        {step === 0 && <Welcome t={t} firstName={firstName} onNext={() => setStep(1)} />}
        {step === 1 && (
          <CurrencyStep t={t} currency={currency} setCurrency={setCurrency}
            busy={busy} onBack={() => setStep(0)} onNext={saveCurrencyAndNext} />
        )}
        {step === 2 && (
          <AccountStep t={t} currency={currency} preset={preset} choosePreset={choosePreset}
            name={name} setName={setName} type={type} setType={setType} opening={opening} setOpening={setOpening}
            busy={busy} onBack={() => setStep(1)} onCreate={createFirstAccount} onSkip={() => setStep(3)} />
        )}
        {step === 3 && <ForkStep t={t} busy={busy} onPick={finish} />}
      </div>
    </div>
  )
}

function StepHeading({ title, body }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-extrabold tracking-[-.3px]">{title}</h1>
      {body && <p className="text-[15px] text-muted mt-2 leading-relaxed">{body}</p>}
    </div>
  )
}

function Welcome({ t, firstName, onNext }) {
  const props = [
    { icon: ShieldIcon, text: t('onboarding.valuePrivate') },
    { icon: AccountsIcon, text: t('onboarding.valueMultiCurrency') },
    { icon: HomeIcon, text: t('onboarding.valueOffline') },
  ]
  return (
    <div>
      <StepHeading
        title={firstName ? t('onboarding.welcomeTitle', { name: firstName }) : t('onboarding.welcomeTitleNoName')}
        body={t('onboarding.welcomeBody')}
      />
      <div className="flex flex-col gap-3 mb-8">
        {props.map(({ icon: Icon, text }, i) => (
          <div key={i} className="flex items-center gap-3 bg-surface border border-border rounded-[14px] px-4 py-3">
            <span className="w-9 h-9 rounded-full bg-primary-soft text-primary grid place-items-center shrink-0">
              <Icon className="w-[18px] h-[18px]" />
            </span>
            <span className="text-sm font-medium leading-snug">{text}</span>
          </div>
        ))}
      </div>
      <Button className="w-full" onClick={onNext}>{t('onboarding.getStarted')}</Button>
    </div>
  )
}

function CurrencyStep({ t, currency, setCurrency, busy, onBack, onNext }) {
  return (
    <div>
      <StepHeading title={t('onboarding.currencyTitle')} body={t('onboarding.currencyBody')} />
      <Field label={t('onboarding.currencyLabel')}>
        <ResponsiveSelect title={t('onboarding.currencyLabel')} placeholder={t('select.placeholder')}
          value={currency} onChange={setCurrency} options={CURRENCY_OPTS} />
      </Field>
      <div className="flex gap-2.5 mt-8">
        <Button variant="ghost" onClick={onBack} disabled={busy}>{t('onboarding.back')}</Button>
        <Button className="flex-1" onClick={onNext} disabled={busy || !currency}>
          {busy ? t('common.loading') : t('onboarding.next')}
        </Button>
      </div>
    </div>
  )
}

function AccountStep({ t, currency, preset, choosePreset, name, setName, type, setType, opening, setOpening, busy, onBack, onCreate, onSkip }) {
  const presets = [
    { key: 'cash', label: t('onboarding.presetCash') },
    { key: 'bank', label: t('onboarding.presetBank') },
    { key: 'ewallet', label: t('onboarding.presetEwallet') },
  ]
  const typeOpts = [
    { value: 'cash', label: t('account.type.cash') },
    { value: 'debit', label: t('account.type.debit') },
  ]
  return (
    <div>
      <StepHeading title={t('onboarding.accountTitle')} body={t('onboarding.accountBody')} />

      <div className="grid grid-cols-3 gap-2 mb-4">
        {presets.map((p) => (
          <button key={p.key} onClick={() => choosePreset(p.key)}
            className={`py-3 rounded-xl border text-sm font-bold transition-colors ${
              preset === p.key ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted hover:bg-surface-2'
            }`}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3.5">
        <Field label={t('onboarding.accountNameLabel')}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)}
            placeholder={t('onboarding.accountNamePlaceholder')} maxLength={60} />
        </Field>
        <Field label={t('onboarding.accountKind')}>
          <Segmented value={type} onChange={setType} options={typeOpts} />
        </Field>
        <Field label={t('onboarding.openingLabel')} hint={t('onboarding.openingHint')}>
          <NumberInput value={opening} onChange={setOpening} allowNegative
            locale={localeFor(currency)} currency={currency} decimals={currencyDecimals(currency)} placeholder="0" />
        </Field>
      </div>

      <div className="flex gap-2.5 mt-8">
        <Button variant="ghost" onClick={onBack} disabled={busy}>{t('onboarding.back')}</Button>
        <Button className="flex-1" onClick={onCreate} disabled={busy}>
          {busy ? t('common.loading') : t('onboarding.createAccount')}
        </Button>
      </div>
      <button onClick={onSkip} disabled={busy}
        className="w-full text-center text-sm font-semibold text-muted hover:text-text mt-4 disabled:opacity-50">
        {t('onboarding.skipForNow')}
      </button>
    </div>
  )
}

function ForkStep({ t, busy, onPick }) {
  const options = [
    { icon: UploadIcon, title: t('onboarding.forkImport'), sub: t('onboarding.forkImportSub'), target: '/import/migrate' },
    { icon: PlusIcon, title: t('onboarding.forkAdd'), sub: t('onboarding.forkAddSub'), target: '/new' },
    { icon: SearchIcon, title: t('onboarding.forkExplore'), sub: t('onboarding.forkExploreSub'), target: '/' },
  ]
  return (
    <div>
      <StepHeading title={t('onboarding.forkTitle')} body={t('onboarding.forkBody')} />
      <div className="flex flex-col gap-3">
        {options.map(({ icon: Icon, title, sub, target }) => (
          <button key={target} onClick={() => onPick(target)} disabled={busy}
            className="flex items-center gap-3.5 bg-surface border border-border rounded-[14px] px-4 py-3.5 text-left hover:bg-surface-2 disabled:opacity-50">
            <span className="w-10 h-10 rounded-full bg-primary-soft text-primary grid place-items-center shrink-0">
              <Icon className="w-5 h-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-bold text-[15px]">{title}</span>
              <span className="block text-[13px] text-muted leading-snug">{sub}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
