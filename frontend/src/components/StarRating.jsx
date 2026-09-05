import { useState } from "react";

// Star rating that works in two modes:
//   • display  — pass `value` (e.g. 4.3) and optional `count`; renders
//     fractional fill and a "4.3 (12)" meta label. `readOnly` (default).
//   • interactive — pass an `onChange(n)` handler; hovering/clicking selects
//     a whole-star rating (1–5). Used by the "rate your meal" form.
export default function StarRating({
  value = 0,
  count,
  onChange,
  size = 16,
  readOnly = false,
}) {
  const [hover, setHover] = useState(0);
  const interactive = !readOnly && typeof onChange === "function";
  const display = interactive ? hover || value : value;

  return (
    <span className={`star-rating ${interactive ? "star-rating-interactive" : ""}`}>
      <span className="star-row">
        {[1, 2, 3, 4, 5].map((n) => {
          let fill = 0;
          if (display >= n) fill = 100;
          else if (display > n - 1) fill = (display - (n - 1)) * 100;

          return (
            <span
              key={n}
              className={`star ${interactive ? "star-interactive" : ""}`}
              style={{ fontSize: size }}
              onMouseEnter={interactive ? () => setHover(n) : undefined}
              onMouseLeave={interactive ? () => setHover(0) : undefined}
              onClick={interactive ? () => onChange(n) : undefined}
              role={interactive ? "button" : undefined}
              tabIndex={interactive ? 0 : undefined}
              onKeyDown={
                interactive
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onChange(n);
                      }
                    }
                  : undefined
              }
              aria-label={interactive ? `${n} star${n > 1 ? "s" : ""}` : undefined}
            >
              <span className="star-bg">★</span>
              <span className="star-fill" style={{ width: `${fill}%` }}>
                ★
              </span>
            </span>
          );
        })}
      </span>

      {!interactive && (
        <span className="star-meta">
          {value > 0 ? Number(value).toFixed(1) : "New"}
          {typeof count === "number" && count > 0 && (
            <span className="star-count"> ({count})</span>
          )}
        </span>
      )}
    </span>
  );
}
