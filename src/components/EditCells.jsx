const INPUT =
  'h-44 w-full min-w-0 r-4 bg-white/20 px-12 fs-34 font-semibold ls-2 text-white outline-none placeholder:text-white/50 focus:bg-white/30 disabled:opacity-60 [&>option]:text-black'
const INVALID = 'ring-2 ring-[#ff8a8a]'

function InOut({ value, labels, onChange, disabled, className = '' }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`${INPUT} ${className}`}
    >
      <option value="in">{labels[0]}</option>
      <option value="out">{labels[1]}</option>
    </select>
  )
}

/** Edit-mode cells for one row: renders inside the same grid, one control per column. */
export default function EditCells({ cfg, draft, onChange, invalid, disabled, options = {} }) {
  const firstText = cfg.fields.findIndex((f) => f && !f.kind)

  return (
    <>
      {cfg.fields.map((f, i) => {
        if (!f) return <span key={i} />
        const place = cfg.headers[i][0]

        if (f.kind) {
          return (
            <div key={i} className="px-8">
              <InOut
                value={draft.type}
                labels={['Income', 'Outcome']}
                disabled={disabled}
                onChange={(type) => onChange({ type })}
              />
            </div>
          )
        }

        if (f.choices) {
          return (
            <div key={i} className="px-8">
              <select
                value={draft[f.key] ?? f.choices[0][0]}
                disabled={disabled}
                onChange={(e) => onChange({ [f.key]: e.target.value })}
                className={INPUT}
              >
                {f.choices.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )
        }

        if (f.select) {
          const base = options[f.select] ?? []
          const cur = draft[f.key]
          // Keep the row's current value pickable even if it is hidden from new entries.
          const names = !cur || base.includes(cur) ? base : [cur, ...base]
          return (
            <div key={i} className="px-8">
              <select
                value={cur ?? ''}
                disabled={disabled}
                onChange={(e) => onChange({ [f.key]: e.target.value })}
                className={`${INPUT} ${invalid && !cur && !f.optional ? INVALID : ''}`}
              >
                <option value="">{names.length ? place : 'Add an account first'}</option>
                {names.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          )
        }

        const bad = invalid && i === firstText && !String(draft[f.key] ?? '').trim()
        return (
          <div key={i} className="flex gap-8 px-8">
            {f.typed && (
              <InOut
                value={draft.type}
                labels={['In', 'Out']}
                disabled={disabled}
                className="!w-100 shrink-0"
                onChange={(type) => onChange({ type })}
              />
            )}
            <input
              autoFocus={i === firstText}
              value={draft[f.key] ?? ''}
              disabled={disabled}
              placeholder={place}
              aria-invalid={bad}
              onChange={(e) => onChange({ [f.key]: e.target.value })}
              className={`${INPUT} ${bad ? INVALID : ''}`}
            />
          </div>
        )
      })}
    </>
  )
}
