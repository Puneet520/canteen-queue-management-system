import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import { getSocket } from "../socket";
import { useAuth } from "../context/AuthContext";

const CATEGORY_ICONS = {
  Meals: "🍛",
  Snacks: "🥪",
  Beverages: "🥤",
  "South Indian": "🥞",
  General: "🍽️",
};

const FOOD_ICONS = {
  "cold coffee": "🧋",
  coffee: "☕",
  tea: "🍵",

  "veg thali": "🍛",
  "punjabi thali": "🍛",
  thali: "🍛",

  "paneer roll": "🌯",
  roll: "🌯",

  samosa: "🥟",

  "veg sandwich": "🥪",
  sandwich: "🥪",

  "masala dosa": "🥞",
  dosa: "🥞",

  idli: "🍘",
  "vada pav": "🍔",
  "pav bhaji": "🥘",
  noodles: "🍜",
  pizza: "🍕",
  burger: "🍔",
  fries: "🍟",
  "french fries": "🍟",
};

function getFoodIcon(item) {
  const name = item.name.trim().toLowerCase();

  if (FOOD_ICONS[name]) {
    return FOOD_ICONS[name];
  }

  for (const [keyword, icon] of Object.entries(FOOD_ICONS)) {
    if (name.includes(keyword)) {
      return icon;
    }
  }

  return CATEGORY_ICONS[item.category] || "🍽️";
}

const CATEGORY_COLORS = {
  Meals: "menu-category-meals",
  Snacks: "menu-category-snacks",
  Beverages: "menu-category-beverages",
  "South Indian": "menu-category-south-indian",
  General: "menu-category-general",
};

export default function Menu() {
  const { user } = useAuth();

  const [items, setItems] = useState([]);
  const [cart, setCart] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [placing, setPlacing] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const navigate = useNavigate();

  useEffect(() => {
    client
      .get("/menu")
      .then(({ data }) => setItems(data.items))
      .catch(() => setError("Could not load the menu"))
      .finally(() => setLoading(false));
  }, []);

  // Real-time stock/menu updates through Socket.IO.
  useEffect(() => {
    if (!user) return;

    const socket = getSocket(user);

    function handleStockChanged(updatedItems) {
      setItems(updatedItems);

      // Keep the cart synchronized with the latest stock.
      setCart((currentCart) => {
        const nextCart = { ...currentCart };

        for (const [menuItemId, quantity] of Object.entries(currentCart)) {
          const item = updatedItems.find((i) => i.id === menuItemId);

          // Remove deleted or unavailable items.
          if (!item || !item.isAvailable || item.stockQty === 0) {
            delete nextCart[menuItemId];
            continue;
          }

          // Never allow cart quantity to exceed current stock.
          if (quantity > item.stockQty) {
            nextCart[menuItemId] = item.stockQty;
          }
        }

        return nextCart;
      });
    }

    socket.on("menu:stock-changed", handleStockChanged);

    return () => {
      socket.off("menu:stock-changed", handleStockChanged);
    };
  }, [user]);

  function updateQty(id, delta, maxStock) {
    setCart((currentCart) => {
      const next = Math.max(
        0,
        Math.min(maxStock, (currentCart[id] || 0) + delta)
      );

      if (next === 0) {
        const updated = { ...currentCart };
        delete updated[id];
        return updated;
      }

      return {
        ...currentCart,
        [id]: next,
      };
    });
  }

  const categories = useMemo(() => {
    return ["All", ...new Set(items.map((item) => item.category))];
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesCategory =
        selectedCategory === "All" ||
        item.category === selectedCategory;

      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        (item.description || "").toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    });
  }, [items, search, selectedCategory]);

  const cartLines = Object.entries(cart)
    .filter(([, quantity]) => quantity > 0)
    .map(([id, quantity]) => ({
      item: items.find((item) => item.id === id),
      quantity,
    }))
    .filter(({ item }) => item);

  const cartCount = cartLines.reduce(
    (sum, line) => sum + line.quantity,
    0
  );

  const total = cartLines.reduce(
    (sum, { item, quantity }) =>
      sum + Number(item.price) * quantity,
    0
  );

  async function placeOrder() {
    setError("");
    setPlacing(true);

    try {
      const payload = {
        items: cartLines.map(({ item, quantity }) => ({
          menuItemId: item.id,
          quantity,
        })),
      };

      const { data } = await client.post("/orders", payload);

      navigate(`/orders/${data.order.id}`);
    } catch (err) {
      const message =
        err.response?.data?.error || "Could not place order";

      setError(message);

      // Refresh menu stock because another student may have
      // purchased an item while it was in this student's cart.
      try {
        const { data } = await client.get("/menu");

        setItems(data.items);

        setCart((currentCart) => {
          const nextCart = { ...currentCart };

          for (const [menuItemId, quantity] of Object.entries(
            currentCart
          )) {
            const item = data.items.find(
              (i) => i.id === menuItemId
            );

            if (
              !item ||
              !item.isAvailable ||
              item.stockQty === 0
            ) {
              delete nextCart[menuItemId];
            } else if (quantity > item.stockQty) {
              nextCart[menuItemId] = item.stockQty;
            }
          }

          return nextCart;
        });
      } catch {
        // Keep the original order error visible.
      }
    } finally {
      setPlacing(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="menu-loading">
          <div className="loading-spinner" />
          <p>Preparing today's menu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page menu-page">
      {/* Hero */}
      <section className="menu-hero">
        <div>
          <span className="menu-eyebrow">
            CANTEEN • TODAY
          </span>

          <h1>
            What are you
            <br />
            craving today? <span>🍽️</span>
          </h1>

          <p>
            Fresh food, simple ordering and a spot in the
            queue — without the waiting.
          </p>
        </div>

        <div className="menu-hero-decoration">
          <span>🥞</span>
          <span>🥪</span>
          <span>🥤</span>
        </div>
      </section>

      {/* Search */}
      <div className="menu-search-wrapper">
        <span className="menu-search-icon">⌕</span>

        <input
          className="menu-search"
          type="text"
          placeholder="Search meals, snacks, beverages..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {search && (
          <button
            className="menu-search-clear"
            onClick={() => setSearch("")}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="error-text">
          {error}
        </div>
      )}

      {/* Categories */}
      <div className="menu-categories">
        {categories.map((category) => (
          <button
            key={category}
            className={`category-pill ${selectedCategory === category
              ? "active"
              : ""
              }`}
            onClick={() => setSelectedCategory(category)}
          >
            {category !== "All" && (
              <span>
                {CATEGORY_ICONS[category] || "🍽️"}
              </span>
            )}

            {category === "All" && <span>✨</span>}

            {category}
          </button>
        ))}
      </div>

      {/* Menu */}
      {filteredItems.length === 0 ? (
        <div className="menu-empty">
          <div className="menu-empty-icon">🍽️</div>

          <h2>No items found</h2>

          <p>
            Try another search or choose a different
            category.
          </p>

          {(search || selectedCategory !== "All") && (
            <button
              className="btn"
              onClick={() => {
                setSearch("");
                setSelectedCategory("All");
              }}
            >
              Show all items
            </button>
          )}
        </div>
      ) : (
        <>
          {selectedCategory === "All" ? (
            categories
              .filter((category) => category !== "All")
              .map((category) => {
                const categoryItems = filteredItems.filter(
                  (item) => item.category === category
                );

                if (categoryItems.length === 0) return null;

                return (
                  <section
                    key={category}
                    className="menu-section"
                  >
                    <div className="menu-section-heading">
                      <div>
                        <span className="menu-section-icon">
                          {CATEGORY_ICONS[category] ||
                            "🍽️"}
                        </span>

                        <div>
                          <h2>{category}</h2>
                          <p>
                            {categoryItems.length}{" "}
                            {categoryItems.length === 1
                              ? "item"
                              : "items"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="food-grid">
                      {categoryItems.map((item, index) => (
                        <FoodCard
                          key={item.id}
                          item={item}
                          quantity={cart[item.id] || 0}
                          onUpdateQty={updateQty}
                          index={index}
                        />
                      ))}
                    </div>
                  </section>
                );
              })
          ) : (
            <section className="menu-section">
              <div className="menu-section-heading">
                <div>
                  <span className="menu-section-icon">
                    {CATEGORY_ICONS[selectedCategory] ||
                      "🍽️"}
                  </span>

                  <div>
                    <h2>{selectedCategory}</h2>
                    <p>
                      {filteredItems.length}{" "}
                      {filteredItems.length === 1
                        ? "item"
                        : "items"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="food-grid">
                {filteredItems.map((item, index) => (
                  <FoodCard
                    key={item.id}
                    item={item}
                    quantity={cart[item.id] || 0}
                    onUpdateQty={updateQty}
                    index={index}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Floating cart */}
      {cartLines.length > 0 && (
        <div className="floating-cart">
          <div className="floating-cart-info">
            <div className="cart-icon-wrapper">
              🛒
              <span key={cartCount} className="cart-count-pop">
                {cartCount}
              </span>
            </div>

            <div className="floating-cart-details">
              <strong>
                {cartCount}{" "}
                {cartCount === 1 ? "item" : "items"}
              </strong>

              <span>
                ₹{total.toFixed(2)} · Pay at counter
              </span>
            </div>
          </div>

          <button
            className="btn floating-cart-button"
            onClick={placeOrder}
            disabled={placing}
          >
            {placing
              ? "Placing..."
              : "Place pre-order →"}
          </button>
        </div>
      )}
    </div>
  );
}

function FoodCard({
  item,
  quantity,
  onUpdateQty,
  index,
}) {
  const unavailable =
    !item.isAvailable || item.stockQty === 0;

  const categoryClass =
    CATEGORY_COLORS[item.category] ||
    "menu-category-general";

  return (
    <article
      className={`food-card ${categoryClass} ${unavailable ? "food-card-unavailable" : ""
        } ${quantity > 0 ? "food-card-selected" : ""}`}
      style={{
        animationDelay: `${index * 70}ms`,
      }}
    >
      <div className="food-visual">
        <span className="food-emoji">
          {getFoodIcon(item)}
        </span>

        <span className="food-category-label">
          {item.category}
        </span>

        {unavailable && (
          <div className="food-unavailable-overlay">
            <span>OUT OF STOCK</span>
          </div>
        )}
      </div>

      <div className="food-content">
        <div className="food-title-row">
          <h3>{item.name}</h3>

          {!unavailable && item.stockQty <= 3 && (
            <span className="low-stock-label">
              Only {item.stockQty} left
            </span>
          )}
        </div>

        <p className="food-description">
          {item.description ||
            "Freshly prepared and ready to order."}
        </p>

        <div className="food-bottom">
          <div className="food-price">
            ₹{Number(item.price).toFixed(2)}
          </div>

          {unavailable ? (
            <span className="badge CANCELLED">
              Out of stock
            </span>
          ) : (
            <div className="quantity-control">
              <button
                className="quantity-button decrease"
                onClick={() =>
                  onUpdateQty(
                    item.id,
                    -1,
                    item.stockQty
                  )
                }
                disabled={quantity === 0}
                aria-label={`Remove one ${item.name}`}
              >
                −
              </button>

              <span
                key={quantity}
                className={`quantity-value ${quantity > 0 ? "quantity-value-animate" : ""
                  }`}
              >
                {quantity}
              </span>

              <button
                className="quantity-button increase"
                onClick={() =>
                  onUpdateQty(
                    item.id,
                    1,
                    item.stockQty
                  )
                }
                disabled={quantity >= item.stockQty}
                aria-label={`Add one ${item.name}`}
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}