# Canteen Queue & Demand Management System — MVP Skeleton

A working slice of the MVP: auth (student/faculty/admin roles), menu browse +
admin CRUD, pre-order placement with atomic stock decrement, a live FIFO
queue position, and real-time order-status updates over Socket.IO.

```
canteen-app/
  backend/    Node.js + Express + Prisma + PostgreSQL + Socket.IO
  frontend/   React (Vite) + React Router + Axios + Socket.IO client
```

## What's implemented

| Requirement | Where |
|---|---|
| FR-1, FR-2 — register/login, role-based access | `backend/src/controllers/auth.controller.js` |
| FR-3, FR-4 — menu browse, hide out-of-stock | `backend/src/controllers/menu.controller.js`, `frontend/src/pages/Menu.jsx` |
| FR-5, FR-6, FR-7 — cart, order placement, pay at counter | `frontend/src/pages/Menu.jsx`, `backend/src/controllers/order.controller.js` |
| FR-9, FR-10, FR-11 — live queue position, wait estimate, status states | `backend/src/utils/queue.js`, `frontend/src/pages/OrderStatus.jsx` |
| FR-12–FR-15 — admin dashboard, status updates, menu management, daily summary | `backend/src/controllers/admin.controller.js`, `frontend/src/pages/AdminDashboard.jsx` |
| FR-16 — real-time in-app alerts | `backend/src/sockets/index.js`, `frontend/src/socket.js` |
| NFR-5 — atomic stock decrement (no overselling) | `order.controller.js` → `prisma.$transaction(...)` |

Not yet implemented (future scope per the SRS): online payment, push
notifications when the tab is closed, inventory→recipe mapping, ML demand
forecasting, analytics dashboard.

## Backend setup

```bash
cd backend
npm install
cp .env.example .env        # then edit DATABASE_URL, JWT_SECRET
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed          # creates an admin login + sample menu
npm run dev                 # starts on http://localhost:5000
```

Seeded admin login: **admin@canteen.edu / Admin@123**

> Note: `npx prisma generate`/`migrate` need to download Prisma's query
> engine binary the first time — do this on a machine with normal internet
> access (it was blocked in the sandbox this project was built in, which
> only allows npm/GitHub package registries). Everything else has already
> been syntax-checked and the full route/middleware wiring smoke-tested.

## Frontend setup

```bash
cd frontend
npm install
cp .env.example .env         # defaults match the backend above
npm run dev                  # starts on http://localhost:5173
```

## Trying it out

1. Start the backend, then the frontend.
2. Register a student account, or log in as admin.
3. As a student: browse the menu, add items to cart, place an order — you'll
   land on a live order-status page showing your queue position.
4. As admin (separate browser/incognito tab): open the Admin Dashboard,
   click "Mark Preparing" / "Mark Ready" / "Mark Collected" on an order —
   the student's screen updates instantly via Socket.IO, no refresh needed.

## Next steps (from the "before coding" plan)

- Draft wireframes for the screens above (currently functional, unstyled-for-polish)
- Add the payment gateway integration (Future Scope: FR-8)
- Add automated tests (unit tests for `queue.js` and `order.controller.js`
  are natural first candidates since they contain the concurrency-sensitive logic)
