
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const path = require("path");
const { randomBytes } = require("crypto");
const { db, initializeDatabase } = require("./database");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET is missing from Render Environment.");
}

app.disable("x-powered-by");
app.use(express.json({ limit: "6mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));

function adminOnly(req, res, next) {
  if (!req.session.admin) {
    return res.status(401).json({
      error: "Admin authentication required."
    });
  }
  next();
}

function handleError(res, err, message = "Something went wrong.") {
  console.error(err);
  if (err.code === "23505") {
    return res.status(409).json({
      error: "This record already exists or duplicates an existing value."
    });
  }
  if (err.code === "23503") {
    return res.status(409).json({
      error: "This record is linked to another record and cannot be removed."
    });
  }
  return res.status(500).json({ error: message });
}

function validId(value) {
  return /^\d+$/.test(String(value)) && Number(value) > 0;
}

function validProductInput(body) {
  const price = Number(body.price);
  const stock = Number(body.stock ?? 0);

  if (
    !String(body.name || "").trim() ||
    !String(body.category || "").trim() ||
    !String(body.image || "").trim() ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isInteger(stock) ||
    stock < 0
  ) {
    return null;
  }

  return {
    name: String(body.name).trim(),
    category: String(body.category).trim(),
    price,
    image: String(body.image).trim(),
    description: String(body.description || ""),
    stock
  };
}

app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({
      ok: true,
      service: "SHOPPING DAVID",
      database: "connected"
    });
  } catch (err) {
    console.error(err);
    res.status(503).json({
      ok: false,
      service: "SHOPPING DAVID",
      database: "unavailable"
    });
  }
});

/* PUBLIC PRODUCTS */

app.get("/api/products", async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");

  try {
    const { category, q } = req.query;
    const conditions = [];
    const values = [];

    if (category) {
      values.push(String(category));
      conditions.push(`category = $${values.length}`);
    }

    if (q) {
      values.push(`%${String(q).slice(0, 150)}%`);
      conditions.push(
        `(name ILIKE $${values.length} OR description ILIKE $${values.length})`
      );
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const result = await db.query(
      `SELECT * FROM public.products ${where} ORDER BY id DESC`,
      values
    );

    res.json(result.rows);
  } catch (err) {
    handleError(res, err, "Could not load products.");
  }
});

app.get("/api/products/:id", async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({ error: "Invalid product ID." });
  }

  try {
    const result = await db.query(
      "SELECT * FROM public.products WHERE id = $1",
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Product not found." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    handleError(res, err, "Could not load this product.");
  }
});

/* CUSTOMER ORDERS AND MONIEPOINT TRANSFERS */

app.post("/api/orders", async (req, res) => {
  const { customer, items } = req.body;

  if (
    !customer ||
    !String(customer.name || "").trim() ||
    !String(customer.email || "").trim() ||
    !String(customer.phone || "").trim() ||
    !String(customer.address || "").trim()
  ) {
    return res.status(400).json({
      error: "Complete customer details are required."
    });
  }

  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    return res.status(400).json({
      error: "Order must contain between 1 and 100 items."
    });
  }

  const paymentMethod = String(
    req.body.payment_method || "moniepoint_transfer"
  );

  const paymentReference = String(
    req.body.payment_reference || ""
  ).trim().slice(0, 200);

  if (paymentMethod !== "moniepoint_transfer") {
    return res.status(400).json({
      error: "Unsupported payment method."
    });
  }

  if (!paymentReference) {
    return res.status(400).json({
      error: "Enter your Moniepoint transfer reference."
    });
  }

  const quantities = new Map();

  for (const item of items) {
    if (!validId(item.id)) {
      return res.status(400).json({
        error: "An item has an invalid product ID."
      });
    }

    const qty = Number(item.qty);

    if (!Number.isInteger(qty) || qty < 1 || qty > 1000) {
      return res.status(400).json({
        error: "Product quantities must be whole numbers greater than zero."
      });
    }

    const id = String(item.id);
    quantities.set(id, (quantities.get(id) || 0) + qty);
  }

  let client;

  try {
    client = await db.connect();
    await client.query("BEGIN");

    const duplicate = await client.query(
      `SELECT id FROM public.orders
       WHERE payment_reference <> ''
       AND LOWER(TRIM(payment_reference)) = LOWER(TRIM($1))
       LIMIT 1`,
      [paymentReference]
    );

    if (duplicate.rows.length) {
      const err = new Error(
        "This transfer reference has already been submitted. Check your receipt and enter the correct reference."
      );
      err.statusCode = 409;
      throw err;
    }

    const verifiedItems = [];
    let total = 0;

    // Lock products in ID order to prevent competing orders from
    // overselling the same stock.
    const sortedItems = [...quantities.entries()]
      .sort(([a], [b]) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);

    for (const [id, quantity] of sortedItems) {
      const result = await client.query(
        "SELECT * FROM public.products WHERE id = $1 FOR UPDATE",
        [id]
      );

      const product = result.rows[0];

      if (!product) {
        const err = new Error(`Product ${id} was not found.`);
        err.statusCode = 400;
        throw err;
      }

      const price = Number(product.price);
      const stock = Number(product.stock);

      if (!Number.isFinite(price) || !Number.isSafeInteger(price)) {
        const err = new Error(
          `${product.name} has an invalid price configuration.`
        );
        err.statusCode = 400;
        throw err;
      }

      if (stock < quantity) {
        const err = new Error(
          `${product.name} does not have enough stock.`
        );
        err.statusCode = 400;
        throw err;
      }

      total += price * quantity;

      if (!Number.isSafeInteger(total)) {
        const err = new Error("Order total is too large.");
        err.statusCode = 400;
        throw err;
      }

      verifiedItems.push({ product, quantity, price });
    }

    const orderNo =
      "SD" +
      Date.now().toString().slice(-8) +
      randomBytes(2).toString("hex").toUpperCase();

    const orderResult = await client.query(
      `INSERT INTO public.orders
        (order_no, customer_name, customer_email, customer_phone,
         customer_address, total, status, payment_method,
         payment_reference, payment_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'Pending',
               $7, $8, 'pending_verification')
       RETURNING id, order_no, total, status, payment_status`,
      [
        orderNo,
        String(customer.name).trim(),
        String(customer.email).trim().toLowerCase(),
        String(customer.phone).trim(),
        String(customer.address).trim(),
        total,
        paymentMethod,
        paymentReference
      ]
    );

    const order = orderResult.rows[0];

    for (const item of verifiedItems) {
      await client.query(
        `INSERT INTO public.order_items
          (order_id, product_id, product_name, price, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          order.id,
          item.product.id,
          item.product.name,
          item.price,
          item.quantity
        ]
      );

      await client.query(
        `UPDATE public.products
         SET stock = stock - $1
         WHERE id = $2`,
        [item.quantity, item.product.id]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: "Order placed successfully. Payment reference saved for manual verification.",
      id: order.id,
      orderNo: order.order_no,
      total: Number(order.total),
      paymentStatus: order.payment_status
    });
  } catch (err) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(rollbackError);
      }
    }

    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }

    if (err.code === "23505") {
      return res.status(409).json({
        error: "This order or transfer reference already exists. Please check your order details."
      });
    }

    handleError(res, err, "Could not place your order.");
  } finally {
    if (client) client.release();
  }
});

/* ADMIN LOGIN */

app.post("/api/admin/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  try {
    const result = await db.query(
      "SELECT * FROM public.admins WHERE email = $1",
      [email]
    );

    const admin = result.rows[0];

    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      return res.status(401).json({
        error: "Invalid email or password."
      });
    }

    req.session.admin = {
      id: admin.id,
      email: admin.email
    };

    res.json({ message: "Login successful.", email: admin.email });
  } catch (err) {
    handleError(res, err, "Could not log in.");
  }
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: "Could not log out." });
    }

    res.clearCookie("connect.sid");
    res.json({ message: "Logged out." });
  });
});

app.get("/api/admin/me", (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({ authenticated: false });
  }

  res.json({ authenticated: true, admin: req.session.admin });
});

/* ADMIN PRODUCT MANAGEMENT */

app.get("/api/admin/products", adminOnly, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM public.products ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    handleError(res, err, "Could not load admin products.");
  }
});

app.post("/api/admin/products", adminOnly, async (req, res) => {
  const product = validProductInput(req.body);

  if (!product) {
    return res.status(400).json({
      error: "Enter a valid name, category, image, positive price and non-negative stock."
    });
  }

  try {
    const result = await db.query(
      `INSERT INTO public.products
        (name, category, price, image, description, stock)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        product.name,
        product.category,
        product.price,
        product.image,
        product.description,
        product.stock
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    handleError(res, err, "Could not add product.");
  }
});

app.put("/api/admin/products/:id", adminOnly, async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({ error: "Invalid product ID." });
  }

  const product = validProductInput(req.body);

  if (!product) {
    return res.status(400).json({
      error: "Enter a valid name, category, image, positive price and non-negative stock."
    });
  }

  try {
    const result = await db.query(
      `UPDATE public.products
       SET name=$1, category=$2, price=$3, image=$4,
           description=$5, stock=$6
       WHERE id=$7
       RETURNING *`,
      [
        product.name,
        product.category,
        product.price,
        product.image,
        product.description,
        product.stock,
        req.params.id
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Product not found." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    handleError(res, err, "Could not update product.");
  }
});

app.delete("/api/admin/products/:id", adminOnly, async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({ error: "Invalid product ID." });
  }

  try {
    const result = await db.query(
      "DELETE FROM public.products WHERE id=$1 RETURNING id",
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Product not found." });
    }

    res.json({ message: "Product deleted." });
  } catch (err) {
    handleError(
      res,
      err,
      "Could not delete product. It may be linked to an existing order."
    );
  }
});

/* ADMIN ORDER MANAGEMENT */

app.get("/api/admin/orders", adminOnly, async (req, res) => {
  try {
    const ordersResult = await db.query(
      "SELECT * FROM public.orders ORDER BY created_at DESC"
    );

    const itemsResult = await db.query(
      "SELECT * FROM public.order_items ORDER BY id"
    );

    const itemsByOrder = new Map();

    for (const item of itemsResult.rows) {
      const key = String(item.order_id);
      if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
      itemsByOrder.get(key).push(item);
    }

    res.json(
      ordersResult.rows.map(order => ({
        ...order,
        items: itemsByOrder.get(String(order.id)) || []
      }))
    );
  } catch (err) {
    handleError(res, err, "Could not load orders.");
  }
});

app.put("/api/admin/orders/:id/status", adminOnly, async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({ error: "Invalid order ID." });
  }

  const allowed = [
    "Pending",
    "Processing",
    "Shipped",
    "Delivered",
    "Cancelled"
  ];

  if (!allowed.includes(req.body.status)) {
    return res.status(400).json({ error: "Invalid order status." });
  }

  try {
    const result = await db.query(
      `UPDATE public.orders SET status=$1
       WHERE id=$2 RETURNING id, status`,
      [req.body.status, req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Order not found." });
    }

    res.json({
      message: "Order status updated.",
      status: result.rows[0].status
    });
  } catch (err) {
    handleError(res, err, "Could not update order status.");
  }
});

app.put("/api/admin/orders/:id/payment-status", adminOnly, async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({ error: "Invalid order ID." });
  }

  const allowed = ["pending_verification", "paid", "rejected"];
  const paymentStatus = String(req.body.payment_status || "");

  if (!allowed.includes(paymentStatus)) {
    return res.status(400).json({ error: "Invalid payment status." });
  }

  try {
    const result = await db.query(
      `UPDATE public.orders SET payment_status=$1
       WHERE id=$2 RETURNING id, payment_status`,
      [paymentStatus, req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Order not found." });
    }

    res.json({
      message: "Payment status updated.",
      payment_status: result.rows[0].payment_status
    });
  } catch (err) {
    handleError(res, err, "Could not update payment status.");
  }
});

app.get("/api/admin/stats", adminOnly, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM public.products) AS products,
        (SELECT COUNT(*) FROM public.orders) AS orders,
        (SELECT COUNT(*) FROM public.orders WHERE status='Pending') AS pending,
        (SELECT COALESCE(SUM(total), 0) FROM public.orders
         WHERE status <> 'Cancelled') AS revenue,
        (SELECT COUNT(*) FROM public.products WHERE stock <= 5) AS "lowStock"
    `);

    const row = result.rows[0];

    res.json({
      products: Number(row.products),
      orders: Number(row.orders),
      pending: Number(row.pending),
      revenue: Number(row.revenue),
      lowStock: Number(row.lowStock)
    });
  } catch (err) {
    handleError(res, err, "Could not load dashboard statistics.");
  }
});

/* CUSTOMER ACCOUNTS */

app.post("/api/customer/register", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (
    !name ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 8
  ) {
    return res.status(400).json({
      error: "Enter your name, a valid email, and a password of at least 8 characters."
    });
  }

  try {
    const hash = await bcrypt.hash(password, 12);

    const result = await db.query(
      `INSERT INTO public.customers (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [name, email, hash]
    );

    const customer = result.rows[0];

    req.session.customer = {
      id: customer.id,
      name: customer.name,
      email: customer.email
    };

    res.status(201).json({
      message: "Account created successfully.",
      customer: req.session.customer
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({
        error: "An account with this email already exists. Please log in."
      });
    }

    handleError(res, err, "Could not create your account right now.");
  }
});

app.post("/api/customer/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  try {
    const result = await db.query(
      "SELECT * FROM public.customers WHERE email=$1",
      [email]
    );

    const customer = result.rows[0];

    if (
      !customer ||
      !(await bcrypt.compare(password, customer.password_hash))
    ) {
      return res.status(401).json({
        error: "Email or password is incorrect."
      });
    }

    req.session.customer = {
      id: customer.id,
      name: customer.name,
      email: customer.email
    };

    res.json({
      message: "Login successful.",
      customer: req.session.customer
    });
  } catch (err) {
    handleError(res, err, "Could not log in.");
  }
});

app.get("/api/customer/me", (req, res) => {
  if (!req.session.customer) {
    return res.status(401).json({ authenticated: false });
  }

  res.json({
    authenticated: true,
    customer: req.session.customer
  });
});

app.get("/api/customer/orders", async (req, res) => {
  if (!req.session.customer) {
    return res.status(401).json({
      error: "Please log in to view your orders."
    });
  }

  try {
    const result = await db.query(
      `SELECT id, order_no, total, status, payment_method,
              payment_reference, payment_status, created_at
       FROM public.orders
       WHERE LOWER(customer_email)=LOWER($1)
       ORDER BY created_at DESC`,
      [req.session.customer.email]
    );

    const orders = result.rows;

    if (!orders.length) return res.json([]);

    const ids = orders.map(order => order.id);

    const itemsResult = await db.query(
      `SELECT order_id, product_name, price, quantity
       FROM public.order_items
       WHERE order_id = ANY($1::bigint[])
       ORDER BY id`,
      [ids]
    );

    const itemsByOrder = new Map();

    for (const item of itemsResult.rows) {
      const key = String(item.order_id);
      if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
      itemsByOrder.get(key).push(item);
    }

    res.json(
      orders.map(order => ({
        ...order,
        items: itemsByOrder.get(String(order.id)) || []
      }))
    );
  } catch (err) {
    handleError(res, err, "Could not load your orders.");
  }
});

app.post("/api/customer/logout", (req, res) => {
  delete req.session.customer;

  req.session.save(err => {
    if (err) {
      return res.status(500).json({ error: "Could not log out." });
    }

    res.json({ message: "Logged out successfully." });
  });
});

/* PAGE ROUTES */

app.get("/customer/login.php", (req, res) => {
  const query = req.originalUrl.includes("?")
    ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
    : "";

  res.redirect(302, "/customer/login.html" + query);
});

app.use(express.static(__dirname));

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "index.html"));
});

app.get("/admin/*splat", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "index.html"));
});

/* START ONLY AFTER THE DATABASE IS READY */

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`SHOPPING DAVID running on port ${PORT}`);
    });
  } catch (err) {
    console.error("SHOPPING DAVID startup failed:", err);
    process.exit(1);
  }
}

startServer();
