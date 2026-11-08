import { useKeys } from '../hooks/useKeys.js'
import RpBox from '../components/RpBox.jsx'
import Shape from '../components/Shape.jsx'
import ImageSlot from '../components/ImageSlot.jsx'

const TABS = [
  { label: 'Main', word: 'MENU', list: null },
  { label: 'Transaction', word: 'LOGS', list: 0 },
  { label: 'Accounts', word: 'MENU', list: 1 },
  { label: 'Ledger', word: 'LIST', list: 2 },
  { label: 'Period', word: 'LIST', list: 3 },
  { label: 'Allocation', word: 'PLAN', list: 4 },
]

const BLUE_A = [[0, 0], [770, 0], [1045, 90], [975, 0], [1220, 0], [1365, 195], [1295, 437]]
const BLUE_B = [
  [1365, 195], [1920, 380], [1920, 650], [1640, 555],
  [1920, 930], [1920, 1080], [1755, 1080], [1295, 437],
]
const LINE = 'absolute bg-[#d2e4ec]'

export default function MainMenu({ selected, onSelect, onOpen, lite, onToggleLite, onSignOut, banks }) {
  const open = (i) => {
    if (TABS[i].list !== null) onOpen(TABS[i].list)
  }

  useKeys((e) => {
    if (e.key === 'ArrowRight') onSelect((selected + 1) % TABS.length)
    else if (e.key === 'ArrowLeft') onSelect((selected + TABS.length - 1) % TABS.length)
    else if (e.key === 'Enter') open(selected)
  })

  return (
    <div className="absolute inset-0 overflow-hidden bg-slate">
      <ImageSlot
        name="menu"
        label="main menu background"
        labelClassName="left-218 top-522 whitespace-nowrap fs-38"
      />

      <Shape points={BLUE_A} className="bg-azure" />
      <Shape points={BLUE_B} className="bg-azure" />

      {/* "Stack 'em up!" band: 3 texts per group, 3 groups, track slides by one group */}
      <div className="pointer-events-none absolute left-0 top-30 h-74 w-[300vmax] origin-top-left rotate-[19.6deg] bg-[#c8ddf5]/60">
        <div className="anim-marquee absolute left-0 top-0 flex h-full w-max items-center">
          {[0, 1, 2].map((g) => (
            <div key={g} className="flex shrink-0" aria-hidden={g > 0}>
              {[0, 1, 2].map((n) => (
                <span
                  key={n}
                  className="w-679 shrink-0 whitespace-nowrap fs-66 font-extrabold text-[#262c36]/60"
                >
                  Stack 'em up!
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Blocks, bottom-left */}
      <div className={`${LINE} inset-x-0 bottom-54 h-6`} />
      <div className="pointer-events-none absolute bottom-0 left-0 h-630 w-448">
        <div className={`${LINE} left-53 top-0 h-full w-6`} />
        <div className={`${LINE} left-246 top-0 h-full w-6`} />
        <div className={`${LINE} bottom-0 left-442 top-190 w-6`} />
        <div className={`${LINE} left-53 top-0 h-5 w-199`} />
        <div className={`${LINE} left-0 top-380 h-6 w-448`} />
        <div
          className="anim-drop absolute left-61 top-7 h-178 w-183 bg-[#b2c3cc]"
          style={{ border: 'calc(var(--u) * 4) solid #dbe9ef', animationDelay: '0.5s' }}
        />
        <div
          className="anim-drop absolute left-59 top-198 h-182 w-187 bg-[#0b6bd3]"
          style={{ animationDelay: '0.3s' }}
        />
        <div
          className="anim-drop absolute left-252 top-198 h-182 w-190 bg-[#0b6bd3]"
          style={{ animationDelay: '0.4s' }}
        />
        <div
          className="anim-drop absolute left-59 top-386 h-184 w-187 bg-[#1966b6]"
          style={{ animationDelay: '0.1s' }}
        />
        <div
          className="anim-drop absolute left-252 top-386 h-184 w-190 bg-[#b2171d]"
          style={{ animationDelay: '0.2s' }}
        />
      </div>

      <div className="anim-slide-l absolute left-0 top-103 flex h-72 w-525 items-center bg-ink pl-33 fs-48 font-bold text-white max-md:top-150">
        Money Management
      </div>

      <RpBox banks={banks} />

      <div className="absolute left-204 right-150 top-196 flex gap-12 max-md:left-24 max-md:right-24 max-md:top-250 max-md:flex-wrap">
        {TABS.map((t, i) => {
          const on = i === selected
          return (
            <button
              key={t.label}
              onMouseEnter={() => onSelect(i)}
              onClick={() => open(i)}
              style={{
                animationDelay: `${i * 45}ms`,
                transition: 'transform 0.14s var(--ease), box-shadow 0.14s',
              }}
              className={`anim-rise relative h-176 min-w-0 flex-1 overflow-hidden r-3 text-left hover:-translate-y-4 hover:shadow-[0_8px_22px_rgba(15,54,64,0.35)] focus-visible:-translate-y-4 focus-visible:shadow-[0_8px_22px_rgba(15,54,64,0.35)] max-md:flex-none max-md:basis-[calc(50%-var(--u)*10)] ${
                on ? 'bg-paper' : 'bg-ink'
              }`}
            >
              <span className={`absolute right-8 top-11 fs-34 font-bold ${on ? 'text-ink' : 'text-white'}`}>
                {t.label}
              </span>
              <span
                className={`absolute left-12 top-94 fs-76 font-black -ls-2 ${
                  on ? 'text-tabword-on' : 'text-tabword'
                }`}
              >
                {t.word}
              </span>
            </button>
          )
        })}
      </div>

      <div className="absolute bottom-20 right-24 z-30 flex gap-12">
      <button
        onClick={(e) => {
          onToggleLite()
          e.currentTarget.blur()
        }}
        aria-pressed={lite}
        className="r-3 bg-ink px-20 py-12 fs-24 font-bold text-white hover:bg-paper hover:text-ink"
      >
        Effects: {lite ? 'Lite' : 'Full'}
      </button>
        <button
          onClick={onSignOut}
          className="r-3 bg-ink px-20 py-12 fs-24 font-bold text-white hover:bg-paper hover:text-ink"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
