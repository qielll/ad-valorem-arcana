import { useId, useState } from "react";
import Shape from "./Shape.jsx";
import { IMAGES } from "../images.js";

// The one background-image element used on every page. It shows the picture configured for `name`
// in src/images.js, or a grey "IMAGE PLACEHOLDER" label while there is none.
//
//   points   optional clip shape in mockup coordinates (1920x1080). Either one polygon [[x, y], ...]
//            or a list of polygons [[[x, y], ...], ...]. With a list, ONE picture spans the full screen
//            and shows through all the polygons. Without points, the slot fills its parent.
//   className   background of the placeholder (and behind the picture).
//   labelClassName   where the placeholder text sits; give the whole string (position, size, wrapping).
const LABEL = "absolute font-bold text-[#4a5160]";
const CENTER = "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap fs-30";

export default function ImageSlot({ name, label = name, points, className = "bg-slate", labelClassName = CENTER }) {
  const [failed, setFailed] = useState(false);
  const clipId = useId().replace(/:/g, "");
  const entry = IMAGES[name];
  const src = typeof entry === "string" ? entry : entry?.src;
  const position = typeof entry === "object" ? entry?.position : undefined;
  const multi = Array.isArray(points?.[0]?.[0]);

  // A single polygon fits the picture to the polygon's bounding box, then clips it to the shape.
  // Several polygons (or none) use the whole area, so the picture is one piece.
  let box = { left: 0, top: 0, width: "100%", height: "100%" };
  if (points && !multi) {
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    box = {
      left: `${x0 / 19.2}%`,
      top: `${y0 / 10.8}%`,
      width: `${(x1 - x0) / 19.2}%`,
      height: `${(y1 - y0) / 10.8}%`,
    };
  }

  const body =
    src && !failed ? (
      <img src={src} alt="" draggable={false} onError={() => setFailed(true)} className="absolute object-cover" style={{ ...box, objectPosition: position }} />
    ) : (
      <div className={`${LABEL} ${labelClassName}`}>[ IMAGE PLACEHOLDER: {label} ]</div>
    );

  if (multi) {
    // One clip path made of several polygons: the browser joins them into a single visible area.
    return (
      <>
        <svg width="0" height="0" className="absolute" aria-hidden="true">
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            {points.map((poly, i) => (
              <polygon key={i} points={poly.map(([x, y]) => `${x / 1920},${y / 1080}`).join(" ")} />
            ))}
          </clipPath>
        </svg>
        <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} style={{ clipPath: `url(#${clipId})` }}>
          {body}
        </div>
      </>
    );
  }
  if (points) {
    return (
      <Shape points={points} className={className}>
        {body}
      </Shape>
    );
  }
  return <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>{body}</div>;
}
