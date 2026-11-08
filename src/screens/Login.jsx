import { useState } from 'react'
import Shape from '../components/Shape.jsx'
import { supabase } from '../lib/supabase.js'

const FIELD =
  'h-64 w-full r-8 bg-white/20 px-20 fs-36 font-semibold text-white outline-none placeholder:text-white/50 focus:bg-white/30'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <div className="absolute inset-0 overflow-hidden bg-sky">
      <Shape points={[[585, 0], [1920, 0], [1920, 1080], [1665, 1080]]} className="bg-sky-light" />
      <div
        className="pointer-events-none absolute left-0 top-0 size-280 bg-navy"
        style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}
      />
      <div className="anim-slide-l absolute left-24 top-37 flex h-80 w-681 items-center justify-center r-12 bg-sky-light fs-58 font-semibold text-deep">
        Log in
      </div>

      <form
        onSubmit={submit}
        className="anim-rise absolute left-24 top-180 flex w-681 flex-col gap-20 r-12 bg-navy p-32"
      >
        <input
          className={FIELD}
          type="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className={FIELD}
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <div className="fs-30 font-bold text-[#ff8a8a]">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="h-64 r-8 bg-gold fs-40 font-bold text-navy transition-transform duration-120 ease-[var(--ease)] enabled:hover:scale-[1.02] disabled:opacity-60"
        >
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
