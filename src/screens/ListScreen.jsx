import { useEffect, useRef, useState } from 'react'
import { useKeys } from '../hooks/useKeys.js'
import { useCursor, useRail } from '../hooks/useCursor.js'
import Shape from '../components/Shape.jsx'
import EditCells from '../components/EditCells.jsx'
import { FloppyIcon, FloppyLoader } from '../components/Floppy.jsx'
import { LISTS } from '../lists.jsx'

const TOOL =
  'absolute top-37 flex h-80 w-80 items-center justify-center r-12 bg-sky-light text-navy transition-transform duration-120 ease-[var(--ease)] enabled:hover:scale-110 enabled:active:scale-90 disabled:opacity-40'

export default function ListScreen({ list, rows, onRows, onSave, options, onList, onBack }) {
  const [sel, setSel] = useState(0)
  const [menu, setMenu] = useState(null) // index of the row showing the small Edit popover
  const [editing, setEditing] = useState(null) // { i, draft, isNew }
  const [invalid, setInvalid] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const rowsRef = useRef(null)
  const scrollRef = useRef(null)
  const cfg = LISTS[list]

  useCursor(rowsRef, sel, [rows.length, list])
  const rail = useRail(scrollRef, [rows.length, list])

  useEffect(() => {
    if (menu === null) return
    const close = (e) => {
      if (!e.target.closest('[data-menu], [data-row]')) setMenu(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menu])

  const cancelEdit = () => {
    if (editing?.isNew) onRows(rows.slice(1))
    setEditing(null)
    setInvalid(false)
    setError(null)
  }

  const startEdit = (i) => {
    if (editing || saving || !rows[i]) return
    setSel(i)
    setMenu(null)
    setEditing({ i, draft: { ...rows[i] }, isNew: false })
  }

  const addRow = () => {
    if (editing || saving) return
    const draft = { ...cfg.blank, ...cfg.defaults?.() }
    onRows([draft, ...rows])
    setSel(0)
    setMenu(null)
    setError(null)
    setEditing({ i: 0, draft, isNew: true })
    scrollRef.current?.scrollTo({ top: 0 })
  }

  const save = async () => {
    if (!editing || saving) return
    const required = cfg.fields.find((f) => f && !f.kind).key
    if (!String(editing.draft[required] ?? '').trim()) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setError(null)
    setSaving(true)
    try {
      // onSave writes to the backend and reloads every list, which replaces the local draft row.
      await onSave(editing.draft, editing.isNew ? null : rows[editing.i])
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const go = (d) => {
    if (saving) return
    cancelEdit()
    onList((list + d + LISTS.length) % LISTS.length)
    setSel(0)
    setMenu(null)
  }

  useKeys((e) => {
    if (saving) return
    if (editing) {
      if (e.key === 'Escape') cancelEdit()
      else if (e.key === 'Enter') save()
      return
    }
    if (e.key === 'ArrowLeft') go(-1)
    else if (e.key === 'ArrowRight') go(1)
    else if (e.key === 'ArrowDown') setSel((s) => Math.min(s + 1, rows.length - 1))
    else if (e.key === 'ArrowUp') setSel((s) => Math.max(s - 1, 0))
    else if (e.key === 'Enter') startEdit(sel)
    else if (e.key === 'Escape' && menu !== null) setMenu(null)
    else if (e.key === 'Escape' || e.key === 'Backspace') onBack()
  })

  return (
    <div className="absolute inset-0 overflow-hidden bg-sky">
      <Shape points={[[585, 0], [1920, 0], [1920, 1080], [1665, 1080]]} className="bg-sky-light" />
      <div
        className="pointer-events-none absolute left-0 top-0 size-280 bg-navy"
        style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}
      />

      <div className="pointer-events-none absolute -bottom-17 left-50 whitespace-nowrap fs-200 font-black italic -ls-6 text-sky-light">
        SAVE A MONEY!
      </div>

      <svg className="pointer-events-none absolute bottom-0 right-0 h-432 w-315" viewBox="1605 648 315 432">
        <polygon points="1605,963 1920,648 1920,1080 1740,1080" fill="#023b63" />
        <polygon points="1645,963 1920,688 1920,792 1695,1018" fill="#ffc54a" />
        <text
          transform="translate(1745 915) rotate(-45)"
          y="44"
          textAnchor="middle"
          fontSize="120"
          fontWeight="900"
          fill="#023b63"
          stroke="#ffc54a"
          strokeWidth="8"
          strokeLinejoin="round"
          style={{ paintOrder: 'stroke' }}
        >
          LIST
        </text>
      </svg>

      {/* Tab title */}
      <div className="anim-slide-l absolute left-24 top-37 h-80 w-681 r-12 bg-sky-light">
        <div className="absolute inset-y-0 left-56 flex w-600 items-center justify-center fs-58 font-semibold text-deep">
          {cfg.title}
        </div>
        <button
          onClick={() => go(-1)}
          className="absolute left-16 top-23 h-36 w-32 transition-transform duration-120 ease-[var(--ease)] hover:scale-115 active:scale-90"
        >
          <svg viewBox="0 0 32 36" className="h-full w-full">
            <polygon points="32,0 0,18 32,36" fill="#0b62cf" />
          </svg>
        </button>
        <button
          onClick={() => go(1)}
          className="absolute left-627 top-23 h-36 w-32 transition-transform duration-120 ease-[var(--ease)] hover:scale-115 active:scale-90"
        >
          <svg viewBox="0 0 32 36" className="h-full w-full">
            <polygon points="0,0 32,18 0,36" fill="#0b62cf" />
          </svg>
        </button>
      </div>

      {/* Add / save, beside the page switcher */}
      <button
        onClick={addRow}
        disabled={!!editing || saving}
        aria-label="Add row"
        title="Add row"
        className={`${TOOL} left-721`}
      >
        <svg viewBox="0 0 40 40" className="h-44 w-44" aria-hidden="true">
          <path d="M16 4h8v12h12v8H24v12h-8V24H4v-8h12z" fill="currentColor" />
        </svg>
      </button>
      <button
        onClick={save}
        disabled={!editing || saving}
        aria-label="Save row"
        title="Save row"
        className={`${TOOL} left-813`}
      >
        <FloppyIcon className="h-48 w-48" />
      </button>

      {error && (
        <button
          onClick={() => setError(null)}
          title="Dismiss"
          className="absolute left-905 top-37 z-40 flex h-80 max-w-1000 items-center r-12 bg-[#b5121b] px-24 text-left fs-30 font-bold lh-34 text-white"
        >
          {error}
        </button>
      )}

      {saving && <FloppyLoader />}

      {/* Table: header stays put, body scrolls with a custom thumb */}
      <div className="absolute inset-x-0 bottom-0 top-145">
        <div ref={scrollRef} className="no-scrollbar h-full overflow-auto">
        <div className="min-w-1920">
          <div className={`sticky top-0 z-30 grid h-87 items-center bg-navy pl-24 pr-12 ${cfg.cols}`}>
            {cfg.headers.map(([label, cls], i) => (
              <span key={i} className={`whitespace-nowrap fs-48 font-bold ls-4 text-white ${cls}`}>
                {label}
              </span>
            ))}
          </div>
          <div
            className={`relative mt-23 flex flex-col pb-20 pl-24 pr-34 ${cfg.gap}`}
            ref={rowsRef}
          >
            <div className={`cursor ${cfg.radius} bg-navy`} aria-hidden="true" />
            {rows.map((r, i) => {
              const isEditing = editing?.i === i
              return (
                <div
                  key={i}
                  data-row={i}
                  onMouseEnter={() => !editing && setSel(i)}
                  onClick={() => {
                    if (editing) return
                    setSel(i)
                    setMenu((m) => (m === i ? null : i))
                  }}
                  onDoubleClick={() => startEdit(i)}
                  className={`relative z-10 grid scroll-mt-110 cursor-default items-center ${cfg.cols} ${cfg.radius} transition-colors duration-150 ${
                    sel === i ? 'text-white' : 'text-deep'
                  }`}
                  style={{ height: `calc(var(--u) * ${cfg.rowH})` }}
                >
                  {isEditing ? (
                    <EditCells
                      cfg={cfg}
                      draft={editing.draft}
                      invalid={invalid}
                      options={options}
                      disabled={saving}
                      onChange={(patch) =>
                        setEditing((e) => ({ ...e, draft: { ...e.draft, ...patch } }))
                      }
                    />
                  ) : (
                    cfg.render(r)
                  )}
                  {menu === i && !editing && (
                    <div
                      data-menu
                      className="anim-rise absolute right-16 top-1/2 z-20 -translate-y-1/2"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          startEdit(i)
                        }}
                        className="r-6 bg-gold px-18 py-8 fs-32 font-bold text-navy shadow-[0_4px_10px_rgba(2,59,99,0.4)] transition-transform duration-120 ease-[var(--ease)] hover:scale-105 active:scale-95"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        </div>

        {/* Custom thumb (hidden when everything fits) */}
        {rail.height < 99.9 && (
          <div className="pointer-events-none absolute bottom-20 right-10 top-110 z-40 w-16 bg-sky-light">
            <div
              className="absolute left-3 w-10 bg-navy transition-all duration-75 ease-[var(--ease)]"
              style={{ top: `${rail.top}%`, height: `${Math.max(12, rail.height)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
