# SHOPPING DAVID — Full Store + Backend

This version keeps the original HTML/CSS/JavaScript storefront and adds a Node.js + Express + SQLite backend and admin dashboard.

## What is included

- Existing storefront pages and styling
- 4 product categories: Clothes & Fashion, Beverages, Gadgets, Daily Needs
- SQLite product database with seeded products and stock
- Real server-side order creation
- Stock validation and automatic stock reduction
- Admin login
- Admin product CRUD
- Admin stock management
- Admin order list and status updates
- Dashboard statistics
- Responsive admin interface

## Run locally

1. Install Node.js (LTS).
2. Open a terminal inside this project folder.
3. Run:

```bash
npm install
npm start
```

4. Open `http://localhost:3000`
5. Admin dashboard: `http://localhost:3000/admin`

Default local admin credentials are created from these environment values:

- Email: `admin@shoppingdavid.com`
- Password: `big7`

For a real deployment, set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `SESSION_SECRET` as environment variables and change the password.

## Important

The payment gateway is not enabled yet. Orders are stored in SQLite and stock is updated on successful order creation. Paystack/Flutterwave can be connected next using server-side secret keys; never put payment secret keys in the frontend.

## Project structure

- `server.js` — Express API/server
- `database.js` — SQLite schema and seed data
- `data/shopping-david.db` — created automatically after first start
- `admin/` — admin dashboard
- `js/` and `css/` — existing storefront
