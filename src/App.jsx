import { useCallback, useEffect, useState } from 'react'
import MainMenu from './screens/MainMenu.jsx'
import ListScreen from './screens/ListScreen.jsx'
import ActionScreen from './screens/ActionScreen.jsx'
import Login from './screens/Login.jsx'
import { FloppyLoader } from './components/Floppy.jsx'
import { fetchAll, fetchBanks, removeRow, saveRow } from './lib/api.js'
import { isConfigured, supabase } from './lib/supabase.js'
import { useSession } from './hooks/useSession.js'

// Optional shortcuts: open /#action, /#confirm or /#list to jump straight to a page.
const start = window.location.hash.slice(1)

const message = (e) => (e instanceof Error ? e.message : String(e))

function Setup() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-sky p-24">
      <div className="max-w-[40rem] r-12 bg-navy p-32 text-white">
        <h1 className="fs-58 font-bold">Setup needed</h1>
        <p className="mt-16 fs-34 lh-44">
          Copy <code>.env.example</code> to <code>.env.local</code>, fill in <code>VITE_SUPABASE_URL</code>{' '}
          and <code>VITE_SUPABASE_ANON_KEY</code>, then restart the dev server.
        </p>
      </div>
    </div>
  )
}

function Main({ lite, onToggleLite }) {
  const [screen, setScreen] = useState(
    start === 'confirm' ? 'action' : ['list', 'action'].includes(start) ? start : 'main',
  )
  const [tab, setTab] = useState(0)
  const [list, setList] = useState(0)
  const [pendingConfirm, setPendingConfirm] = useState(start === 'confirm')

  // store[i] holds the rows of LISTS[i], straight from the backend (null while loading).
  const [store, setStore] = useState(null)
  const [notice, setNotice] = useState(null)
  const [banks, setBanks] = useState(null) // { savings, spending } real balances, null until loaded

  const reload = useCallback(async () => {
    try {
      const [all, b] = await Promise.all([fetchAll(), fetchBanks().catch(() => null)])
      setStore(all)
      setBanks(b)
    } catch (e) {
      setNotice(message(e))
      setStore((s) => s ?? [[], [], [], [], []])
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const rows = store?.[list] ?? []
  const accounts = store?.[1] ?? []
  const options = {
    // Interest and bank fee accounts are posted by the monthly job, so they are not offered for new entries.
    account: accounts.filter((a) => !a.auto).map((a) => a.name),
    fund: accounts.filter((a) => a.isFund).map((a) => a.name),
    bank: ['Savings', 'Spending'],
    role: ['Plain', 'Fund', 'Ledger fund'],
  }

  // ListScreen keeps an unsaved draft row locally; this only touches the local copy.
  const setRows = (next) => setStore((s) => s.map((r, i) => (i === list ? next : r)))

  const save = async (draft, original) => {
    await saveRow(list, draft, original, store[1])
    await reload()
  }

  const remove = async (row) => {
    try {
      await removeRow(list, row)
      await reload()
    } catch (e) {
      setNotice(message(e))
    }
  }

  const go = (next) => {
    setPendingConfirm(false)
    setScreen(next)
  }

  return (
    <div className="relative h-dvh w-full select-none overflow-hidden font-sans">
      {screen === 'main' && (
        <MainMenu
          selected={tab}
          onSelect={setTab}
          banks={banks}
          lite={lite}
          onToggleLite={onToggleLite}
          onSignOut={() => supabase.auth.signOut()}
          onOpen={(l) => {
            setList(l)
            go('action')
          }}
        />
      )}
      {screen === 'action' && (
        <ActionScreen
          list={list}
          rows={rows}
          banks={banks}
          onDelete={remove}
          startConfirm={pendingConfirm}
          onBack={() => go('main')}
          onOpenList={() => go('list')}
        />
      )}
      {screen === 'list' && (
        <ListScreen
          list={list}
          rows={rows}
          onRows={setRows}
          onSave={save}
          options={options}
          onList={setList}
          onBack={() => go('action')}
        />
      )}

      {store === null && <FloppyLoader label="Loading..." />}
      {notice && (
        <button
          onClick={() => setNotice(null)}
          title="Dismiss"
          className="absolute left-1/2 top-8 z-[60] max-w-[90%] -translate-x-1/2 r-8 bg-[#b5121b] px-24 py-12 text-center fs-30 font-bold text-white"
        >
          {notice}
        </button>
      )}
    </div>
  )
}

function Gate({ lite, onToggleLite }) {
  const { session, ready } = useSession()
  if (!ready) return <div className="relative h-dvh bg-sky"><FloppyLoader label="Loading..." /></div>
  if (!session) return <div className="relative h-dvh w-full overflow-hidden font-sans"><Login /></div>
  return <Main lite={lite} onToggleLite={onToggleLite} />
}

export default function App() {
  const [lite, setLite] = useState(() => {
    try {
      const saved = localStorage.getItem('lite')
      if (saved !== null) return saved === '1'
    } catch {}
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  })

  useEffect(() => {
    document.documentElement.dataset.lite = String(lite)
    try {
      localStorage.setItem('lite', lite ? '1' : '0')
    } catch {}
  }, [lite])

  if (!isConfigured) return <div className="relative h-dvh w-full font-sans"><Setup /></div>
  return <Gate lite={lite} onToggleLite={() => setLite((v) => !v)} />
}
