import { useEffect, useState } from "react";
import client from "../api/client";
import VegBadge from "./VegBadge";
import StarRating from "./StarRating";

// Full-detail modal for a menu item: hero image, dietary badge, nutrition
// breakdown, allergens, add-to-cart controls, and the item's recent reviews
// (fetched live from the public GET /menu/:id/reviews endpoint).
export default function ItemDetailModal({
  item,
  quantity,
  onUpdateQty,
  onClose,
  fallbackIcon = "🍽️",
}) {
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [imgError, setImgError] = useState(false);

  const unavailable = !item.isAvailable || item.stockQty === 0;

  useEffect(() => {
    let active = true;
    setLoadingReviews(true);
    client
      .get(`/menu/${item.id}/reviews`)
      .then(({ data }) => {
        if (active) setReviews(data.reviews || []);
      })
      .catch(() => active && setReviews([]))
      .finally(() => active && setLoadingReviews(false));
    return () => {
      active = false;
    };
  }, [item.id]);

  // Close on Escape.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const nutrition = [
    { label: "Calories", value: item.calories, unit: "kcal" },
    { label: "Protein", value: item.protein, unit: "g" },
    { label: "Carbs", value: item.carbs, unit: "g" },
    { label: "Fat", value: item.fat, unit: "g" },
  ].filter((n) => n.value != null);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="item-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="item-modal-hero">
          {item.imageUrl && !imgError ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              onError={() => setImgError(true)}
            />
          ) : (
            <span className="item-modal-hero-emoji">{fallbackIcon}</span>
          )}
          {unavailable && (
            <div className="food-unavailable-overlay">
              <span>OUT OF STOCK</span>
            </div>
          )}
        </div>

        <div className="item-modal-body">
          <div className="item-modal-titlerow">
            <div className="item-modal-title">
              <VegBadge type={item.foodType} isJain={item.isJain} size={18} />
              <h2>{item.name}</h2>
            </div>
            <div className="item-modal-price">₹{Number(item.price).toFixed(2)}</div>
          </div>

          <div className="item-modal-meta">
            <StarRating value={item.avgRating} count={item.ratingCount} size={18} />
            <span className="item-modal-category">{item.category}</span>
          </div>

          <p className="item-modal-desc">
            {item.description || "Freshly prepared and ready to order."}
          </p>

          {nutrition.length > 0 && (
            <div className="nutrition-block">
              <h4>Nutrition (per serving)</h4>
              <div className="nutrition-grid">
                {nutrition.map((n) => (
                  <div key={n.label} className="nutrition-cell">
                    <span className="nutrition-value">
                      {n.value}
                      <small>{n.unit}</small>
                    </span>
                    <span className="nutrition-label">{n.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {item.allergens && item.allergens.length > 0 && (
            <div className="allergen-block">
              <h4>Allergens</h4>
              <div className="allergen-chips">
                {item.allergens.map((a) => (
                  <span key={a} className="allergen-chip">
                    ⚠ {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Add to cart */}
          <div className="item-modal-actions">
            {unavailable ? (
              <span className="badge CANCELLED">Out of stock</span>
            ) : (
              <div className="quantity-control">
                <button
                  className="quantity-button decrease"
                  onClick={() => onUpdateQty(item.id, -1, item.stockQty)}
                  disabled={quantity === 0}
                  aria-label={`Remove one ${item.name}`}
                >
                  −
                </button>
                <span className="quantity-value">{quantity}</span>
                <button
                  className="quantity-button increase"
                  onClick={() => onUpdateQty(item.id, 1, item.stockQty)}
                  disabled={quantity >= item.stockQty}
                  aria-label={`Add one ${item.name}`}
                >
                  +
                </button>
              </div>
            )}
          </div>

          {/* Reviews */}
          <div className="reviews-block">
            <h4>
              Reviews
              {item.ratingCount > 0 && (
                <span className="muted"> · {item.ratingCount}</span>
              )}
            </h4>

            {loadingReviews ? (
              <p className="muted">Loading reviews…</p>
            ) : reviews.length === 0 ? (
              <p className="muted">No reviews yet — be the first after you try it!</p>
            ) : (
              <ul className="review-list">
                {reviews.map((r) => (
                  <li key={r.id} className="review-item">
                    <div className="review-item-head">
                      <StarRating value={r.rating} size={13} />
                      <span className="review-author">{r.reviewer}</span>
                      <span className="review-date">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {r.comment && <p className="review-comment">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
