const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "shopping-david-local-session-secret";

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 8 }
}));

function adminOnly(req, res, next) {
  if (!req.session.admin) return res.status(401).json({ error: "Admin authentication required." });
  next();
}

app.get("/api/health", (req, res) => res.json({ ok: true, service: "SHOPPING DAVID" }));

app.get("/api/products", (req, res) => {
  const { category, q } = req.query;
  let sql = "SELECT * FROM products WHERE 1=1";
  const params = [];
  if (category) { sql += " AND category = ?"; params.push(category); }
  if (q) { sql += " AND (name LIKE ? OR description LIKE ?)"; const term = `%${q}%`; params.push(term, term); }
  sql += " ORDER BY id DESC";
  res.json(db.prepare(sql).all(...params));
});

app.get("/api/products/:id", (req, res) => {
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found." });
  res.json(product);
});

app.post("/api/orders", (req, res) => {
  const { customer, items } = req.body;
  if (!customer || !customer.name || !customer.email || !customer.phone || !customer.address) {
    return res.status(400).json({ error: "Complete customer details are required." });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Order must contain at least one item." });
  }

  const createOrder = db.transaction(() => {
    let total = 0;
    const verifiedItems = [];

    for (const item of items) {
      const product = db.prepare("SELECT * FROM products WHERE id = ?").get(item.id);
      const quantity = Math.max(1, Number(item.qty || 1));
      if (!product) throw new Error(`Product ${item.id} was not found.`);
      if (product.stock < quantity) throw new Error(`${product.name} does not have enough stock.`);
      total += product.price * quantity;
      verifiedItems.push({ product, quantity });
    }

    const orderNo = "SD" + Date.now().toString().slice(-8);
    const result = db.prepare(`
      INSERT INTO orders (order_no, customer_name, customer_email, customer_phone, customer_address, total, status)
      VALUES (?, ?, ?, ?, ?, ?, 'Pending')
    `).run(orderNo, customer.name, customer.email, customer.phone, customer.address, total);

    const orderId = result.lastInsertRowid;
    const addItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, price, quantity)
      VALUES (?, ?, ?, ?, ?)
    `);
    const reduceStock = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");

    for (const item of verifiedItems) {
      addItem.run(orderId, item.product.id, item.product.name, item.product.price, item.quantity);
      reduceStock.run(item.quantity, item.product.id);
    }

    return { id: orderId, orderNo, total };
  });

  try {
    const order = createOrder();
    res.status(201).json({ message: "Order placed successfully.", ...order });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body;
  const admin = db.prepare("SELECT * FROM admins WHERE email = ?").get(email);
  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  req.session.admin = { id: admin.id, email: admin.email };
  res.json({ message: "Login successful.", email: admin.email });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ message: "Logged out." }));
});

app.get("/api/admin/me", (req, res) => {
  if (!req.session.admin) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, admin: req.session.admin });
});

app.get("/api/admin/products", adminOnly, (req, res) => {
  res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all());
});

app.post("/api/admin/products", adminOnly, (req, res) => {
  const { name, category, price, image, description, stock } = req.body;
  if (!name || !category || !price || !image) return res.status(400).json({ error: "Name, category, price and image are required." });
  const result = db.prepare(`
    INSERT INTO products (name, category, price, image, description, stock)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, category, Number(price), image, description || "", Math.max(0, Number(stock || 0)));
  res.status(201).json(db.prepare("SELECT * FROM products WHERE id = ?").get(result.lastInsertRowid));
});

app.put("/api/admin/products/:id", adminOnly, (req, res) => {
  const { name, category, price, image, description, stock } = req.body;
  const result = db.prepare(`
    UPDATE products SET name=?, category=?, price=?, image=?, description=?, stock=?
    WHERE id=?
  `).run(name, category, Number(price), image, description || "", Math.max(0, Number(stock || 0)), req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Product not found." });
  res.json(db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id));
});

app.delete("/api/admin/products/:id", adminOnly, (req, res) => {
  const result = db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Product not found." });
  res.json({ message: "Product deleted." });
});

app.get("/api/admin/orders", adminOnly, (req, res) => {
  const orders = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
  const getItems = db.prepare("SELECT * FROM order_items WHERE order_id = ?");
  res.json(orders.map(o => ({ ...o, items: getItems.all(o.id) })));
});

app.put("/api/admin/orders/:id/status", adminOnly, (req, res) => {
  const allowed = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid order status." });
  const result = db.prepare("UPDATE orders SET status=? WHERE id=?").run(req.body.status, req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Order not found." });
  res.json({ message: "Order status updated." });
});

app.get("/api/admin/stats", adminOnly, (req, res) => {
  const products = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
  const orders = db.prepare("SELECT COUNT(*) AS count FROM orders").get().count;
  const pending = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status='Pending'").get().count;
  const revenue = db.prepare("SELECT COALESCE(SUM(total),0) AS total FROM orders WHERE status != 'Cancelled'").get().total;
  const lowStock = db.prepare("SELECT COUNT(*) AS count FROM products WHERE stock <= 5").get().count;
  res.json({ products, orders, pending, revenue, lowStock });
});


app.post("/api/customer/register", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!name || !email || password.length < 8) {
    return res.status(400).json({ error: "Enter your name, a valid email, and a password of at least 8 characters." });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare("INSERT INTO customers (name, email, password_hash) VALUES (?, ?, ?)").run(name, email, hash);
    req.session.customer = { id: result.lastInsertRowid, name, email };
    res.status(201).json({ message: "Account created successfully.", customer: req.session.customer });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) return res.status(409).json({ error: "An account with this email already exists. Please log in." });
    res.status(500).json({ error: "Could not create your account right now." });
  }
});

app.post("/api/customer/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const customer = db.prepare("SELECT * FROM customers WHERE email = ?").get(email);
  if (!customer || !(await bcrypt.compare(password, customer.password_hash))) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  req.session.customer = { id: customer.id, name: customer.name, email: customer.email };
  res.json({ message: "Login successful.", customer: req.session.customer });
});

app.get("/api/customer/me", (req, res) => {
  if (!req.session.customer) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, customer: req.session.customer });
});

app.post("/api/customer/logout", (req, res) => {
  delete req.session.customer;
  req.session.save(err => {
    if (err) return res.status(500).json({ error: "Could not log out." });
    res.json({ message: "Logged out successfully." });
  });
});

app.use(express.static(__dirname));

app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "admin", "index.html")));
app.get("/admin/*splat", (req, res) => res.sendFile(path.join(__dirname, "admin", "index.html")));

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

app.listen(PORT, () => {
  console.log(`SHOPPING DAVID running at http://localhost:${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
});
