import { useRef, useState } from "react";
import { useKeys } from "../hooks/useKeys.js";
import { useCursor, useRail } from "../hooks/useCursor.js";
import RpBox from "../components/RpBox.jsx";
import ImageSlot from "../components/ImageSlot.jsx";
import ConfirmDelete from "../components/ConfirmDelete.jsx";
import { LISTS } from "../lists.jsx";

const GREY_L = [
  [0, 0],
  [478, 0],
  [608, 215],
  [4, 260],
  [4, 772],
  [903, 703],
  [1130, 1080],
  [0, 1080],
];
const GREY_TR = [
  [1366, 0],
  [1920, 0],
  [1920, 130],
  [1452, 157],
];
const GREY_R = [
  [1757, 637],
  [1920, 625],
  [1920, 918],
];

export default function ActionScreen({ list, rows, banks, onDelete, onBack, onOpenList, startConfirm = false }) {
  const cfg = LISTS[list];
  const rowH = Math.max(86, cfg.rowH);
  const [sel, setSel] = useState(0);
  const [confirm, setConfirm] = useState(startConfirm);
  const scrollRef = useRef(null);
  const rowsRef = useRef(null);

  useCursor(rowsRef, sel, [rows.length, list]);
  const rail = useRail(scrollRef, [rows.length, list]);

  useKeys((e) => {
    if (confirm) return;
    if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, rows.length - 1));
    else if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
    else if (e.key === "Enter") onOpenList();
    else if (e.key === "Escape" || e.key === "Backspace") onBack();
  });

  return (
    <div className="absolute inset-0 overflow-hidden bg-azure">
      {/* One picture across the page, visible through the three grey shapes */}
      <ImageSlot
        name="action"
        label="action page background"
        points={[GREY_L, GREY_TR, GREY_R]}
        labelClassName="bottom-141 left-122 whitespace-nowrap fs-36"
      />

      {/* Frame lines */}
      <div className="absolute inset-x-0 top-30 h-7 bg-frame" />
      <div className="absolute left-424 top-0 h-130 w-6 bg-frame" />
      <div className="absolute left-0 top-124 h-6 w-430 bg-frame" />

      <button onClick={onBack} className="absolute left-42 top-25 fs-113 font-black ls-12 transition-transform duration-120 ease-[var(--ease)] hover:-translate-x-2 focus-visible:-translate-x-2">
        <span className="text-crimson">B</span>
        <span className="text-white">ACK</span>
      </button>

      <div className="anim-rise absolute left-[30.47%] right-[28.8%] top-30 h-102 max-md:left-0 max-md:right-0 max-md:top-225">
        <div className="absolute -top-30 left-1 h-30 w-6 bg-frame" />
        <div className="absolute -top-30 right-2 h-30 w-6 bg-frame" />
        <div className="flex h-full items-center justify-center bg-paper2 fs-64 font-semibold text-ink">{cfg.title}</div>
      </div>

      <RpBox banks={banks} className="max-md:top-140" />

      {/* Data rows: same columns as the matching "Save a Money!" list */}
      <div className="absolute left-88 right-45 top-265 h-347 max-md:left-24 max-md:right-24 max-md:top-360">
        <div className="pointer-events-none absolute left-61 top-0 z-20 h-full w-16 bg-paper2" />
        <div
          className="pointer-events-none absolute left-64 z-20 w-10 bg-btn transition-all duration-75 ease-[var(--ease)]"
          style={rail.height < 99.9 ? { top: `${rail.top}%`, height: `${Math.max(12, rail.height)}%` } : { top: "calc(var(--u) * 13)", height: "calc(var(--u) * 47)" }}
        />
        <div ref={scrollRef} className="no-scrollbar h-full overflow-auto">
          <div className="relative min-w-1787">
            <div className="relative flex flex-col gap-13 pt-13" ref={rowsRef}>
              <div className="cursor r-4 bg-ink" aria-hidden="true" />
              {rows.map((r, i) => (
                <div
                  key={i}
                  data-row={i}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => setSel(i)}
                  onDoubleClick={onOpenList}
                  className={`relative z-10 grid cursor-default items-center r-4 pl-81 transition-colors duration-150 ${cfg.cols} ${sel === i ? "text-paper2" : "text-ink"}`}
                  style={{ height: `calc(var(--u) * ${rowH})` }}
                >
                  {cfg.render(r)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-175 left-0 flex h-70 w-688 items-center bg-ink pl-32 fs-48 font-bold text-white max-md:bottom-420">What to do with these data?</div>

      <div className="absolute bottom-18 left-[57.7%] max-md:left-24 max-md:right-24">
        <div className="flex flex-col gap-20">
          {["Create", "Edit", "Delete"].map((b) => (
            <button
              key={b}
              onClick={b === "Delete" ? () => setConfirm(true) : onOpenList}
              className="flex h-63 w-223 items-center justify-center r-2 bg-paper fs-46 font-semibold text-btn transition-[background-color,color,transform] duration-120 ease-[var(--ease)] hover:bg-ink hover:text-white hover:translate-x-4 focus-visible:bg-ink focus-visible:text-white focus-visible:translate-x-4"
            >
              {b}
            </button>
          ))}
        </div>
        <div className="mt-16 flex gap-15 text-ink">
          <svg className="anim-nudge mt-16 h-27 w-30 shrink-0" viewBox="0 0 30 27">
            <polygon points="0,0 30,13.5 0,27" fill="currentColor" />
          </svg>
          <div key={sel} className="anim-rise fs-48 font-bold lh-55 ls-2">
            {(rows[sel] ? cfg.describe(rows[sel]) : ["No data yet"]).map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      </div>

      {confirm && <ConfirmDelete onClose={() => setConfirm(false)} onConfirm={() => rows[sel] && onDelete(rows[sel])} />}
    </div>
  );
}
