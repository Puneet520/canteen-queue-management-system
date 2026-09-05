// Classic Indian food-type indicator: a bordered square with a filled dot
// (green = veg, red = non-veg, amber = egg), with an optional text label and
// a "Jain" tag. Used on menu cards, the item modal, and order summaries.
const CONFIG = {
  VEG: { color: "#0f7a3d", label: "Veg" },
  NON_VEG: { color: "#b4231f", label: "Non-veg" },
  EGG: { color: "#c98a00", label: "Egg" },
};

export default function VegBadge({
  type = "VEG",
  isJain = false,
  showLabel = false,
  size = 16,
}) {
  const cfg = CONFIG[type] || CONFIG.VEG;
  const title = cfg.label + (isJain ? " · Jain" : "");

  return (
    <span className="veg-badge-wrap" title={title}>
      <span
        className="veg-badge"
        style={{ "--veg-color": cfg.color, width: size, height: size }}
        role="img"
        aria-label={title}
      >
        <span className="veg-badge-dot" />
      </span>

      {showLabel && (
        <span className="veg-badge-label" style={{ color: cfg.color }}>
          {cfg.label}
        </span>
      )}

      {isJain && <span className="jain-tag">Jain</span>}
    </span>
  );
}
