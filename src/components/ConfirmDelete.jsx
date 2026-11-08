import { useState } from 'react'
import { useKeys } from '../hooks/useKeys.js'
import ImageSlot from './ImageSlot.jsx'

const OPTIONS = ['\u201CYes.\u201D', '\u201CNo.\u201D']

export default function ConfirmDelete({ onClose, onConfirm }) {
  const [choice, setChoice] = useState(0)

  const pick = (i) => {
    if (i === 0) onConfirm?.()
    onClose()
  }

  useKeys((e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setChoice((c) => 1 - c)
    else if (e.key === 'Enter') pick(choice)
    else if (e.key === 'Escape') onClose()
  })

  return (
    <>
      {/* System message pill */}
      <div
        className="absolute bottom-24 left-57 right-77 h-294 rounded-full bg-[#cddce8]/85 max-md:left-12 max-md:right-12"
        style={{ animation: 'rise 0.22s 0.05s var(--ease) both' }}
      >
        <div
          className="absolute bottom-24 left-101 right-98 top-25 r-22 max-md:left-40 max-md:right-40"
          style={{ border: 'calc(var(--u) * 4) solid #a0abb3' }}
        >
          <div className="absolute left-49 top-28 fs-50 font-bold text-[#1f3a5c]">System</div>
          <div className="absolute left-79 right-40 top-92 fs-52 font-bold lh-60 text-[#5d6167] max-md:left-49">
            Are you sure you want to delete this?
          </div>
        </div>
      </div>

      {/* Choice box */}
      <div
        className="absolute bottom-293 left-[5.63%] right-[11.72%] h-289 r-30 bg-[#ccd8df] shadow-[0_6px_14px_rgba(0,0,0,0.25)] max-md:left-24 max-md:right-24"
        style={{
          border: 'calc(var(--u) * 4) solid #e4edf1',
          animation: 'rise 0.22s var(--ease) both',
        }}
      >
        <div className="absolute bottom-26 left-22 right-23 top-28 flex overflow-hidden r-4">
          <div className="relative flex-1 bg-[#b0c4cf]">
            {OPTIONS.map((o, i) => (
              <button
                key={o}
                onMouseEnter={() => setChoice(i)}
                onClick={() => pick(i)}
                className={`absolute inset-x-0 h-68 r-8 pl-37 text-left fs-55 font-semibold transition-[background-color,color,transform] duration-120 ease-[var(--ease)] ${
                  choice === i
                    ? 'bg-[#2079eb] text-white translate-x-2'
                    : 'text-[#2a6fd6] hover:translate-x-1'
                }`}
                style={{ top: `calc(var(--u) * ${35 + i * 75})` }}
              >
                {o}
              </button>
            ))}
          </div>
          <div className="relative w-467 max-md:hidden">
            <ImageSlot
              name="confirm-side"
              label="right edge"
              className="bg-[#7bafc1]"
              labelClassName="left-1/2 top-1/2 w-300 -translate-x-1/2 -translate-y-1/2 text-center fs-20 lh-24"
            />
          </div>
        </div>
      </div>
    </>
  )
}
