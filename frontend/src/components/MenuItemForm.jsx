import { useState } from "react";

const FOOD_TYPES = [
  { value: "VEG", label: "🟢 Veg" },
  { value: "NON_VEG", label: "🔴 Non-veg" },
  { value: "EGG", label: "🟡 Egg" },
];

const EMPTY = {
  name: "",
  price: "",
  category: "General",
  stockQty: "",
  description: "",
  imageUrl: "",
  foodType: "VEG",
  isJain: false,
  allergens: "",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
  prepTimeMinutes: "",
  station: "",
};

// Shared create/edit form for a menu item. Manages its own field state,
// initialised from `initial` (an existing item, or nothing for "add"). Calls
// onSubmit with a typed payload ready for POST/PUT /menu.
export default function MenuItemForm({
  initial,
  onSubmit,
  submitLabel = "Save",
  busy = false,
}) {
  const [form, setForm] = useState(() => ({ ...EMPTY, ...toFormShape(initial) }));

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit(toPayload(form));
  }

  return (
    <form className="menu-item-form" onSubmit={handleSubmit}>
      <div className="mif-grid">
        <label className="mif-field mif-col-2">
          <span>Name *</span>
          <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </label>

        <label className="mif-field">
          <span>Price (₹) *</span>
          <input className="input" type="number" step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} required />
        </label>

        <label className="mif-field">
          <span>Stock</span>
          <input className="input" type="number" value={form.stockQty} onChange={(e) => set("stockQty", e.target.value)} />
        </label>

        <label className="mif-field">
          <span>Category</span>
          <input className="input" value={form.category} onChange={(e) => set("category", e.target.value)} />
        </label>

        <label className="mif-field">
          <span>Food type</span>
          <select className="input" value={form.foodType} onChange={(e) => set("foodType", e.target.value)}>
            {FOOD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>

        <label className="mif-field mif-check">
          <input type="checkbox" checked={form.isJain} onChange={(e) => set("isJain", e.target.checked)} />
          <span>Jain-friendly</span>
        </label>

        <label className="mif-field mif-col-3">
          <span>Description</span>
          <input className="input" value={form.description} onChange={(e) => set("description", e.target.value)} />
        </label>

        <label className="mif-field mif-col-3">
          <span>Image URL</span>
          <input className="input" placeholder="https://…" value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} />
        </label>

        <label className="mif-field mif-col-3">
          <span>Allergens (comma separated)</span>
          <input className="input" placeholder="Gluten, Dairy, Nuts" value={form.allergens} onChange={(e) => set("allergens", e.target.value)} />
        </label>

        <label className="mif-field"><span>Calories</span><input className="input" type="number" value={form.calories} onChange={(e) => set("calories", e.target.value)} /></label>
        <label className="mif-field"><span>Protein (g)</span><input className="input" type="number" value={form.protein} onChange={(e) => set("protein", e.target.value)} /></label>
        <label className="mif-field"><span>Carbs (g)</span><input className="input" type="number" value={form.carbs} onChange={(e) => set("carbs", e.target.value)} /></label>
        <label className="mif-field"><span>Fat (g)</span><input className="input" type="number" value={form.fat} onChange={(e) => set("fat", e.target.value)} /></label>
        <label className="mif-field"><span>Prep time (min)</span><input className="input" type="number" value={form.prepTimeMinutes} onChange={(e) => set("prepTimeMinutes", e.target.value)} /></label>
        <label className="mif-field"><span>Station</span><input className="input" value={form.station} onChange={(e) => set("station", e.target.value)} /></label>
      </div>

      <button className="btn small" type="submit" disabled={busy}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function toFormShape(item) {
  if (!item) return {};
  return {
    name: item.name ?? "",
    price: item.price ?? "",
    category: item.category ?? "General",
    stockQty: item.stockQty ?? "",
    description: item.description ?? "",
    imageUrl: item.imageUrl ?? "",
    foodType: item.foodType ?? "VEG",
    isJain: Boolean(item.isJain),
    allergens: Array.isArray(item.allergens)
      ? item.allergens.join(", ")
      : item.allergens ?? "",
    calories: item.calories ?? "",
    protein: item.protein ?? "",
    carbs: item.carbs ?? "",
    fat: item.fat ?? "",
    prepTimeMinutes: item.prepTimeMinutes ?? "",
    station: item.station ?? "",
  };
}

function toNum(v) {
  return v === "" || v === null || v === undefined ? undefined : Number(v);
}

function toPayload(form) {
  return {
    name: form.name,
    price: toNum(form.price),
    category: form.category || "General",
    stockQty: toNum(form.stockQty) ?? 0,
    description: form.description || null,
    imageUrl: form.imageUrl || null,
    foodType: form.foodType,
    isJain: form.isJain,
    allergens: form.allergens
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean),
    calories: toNum(form.calories) ?? null,
    protein: toNum(form.protein) ?? null,
    carbs: toNum(form.carbs) ?? null,
    fat: toNum(form.fat) ?? null,
    prepTimeMinutes: toNum(form.prepTimeMinutes),
    station: form.station || undefined,
  };
}
