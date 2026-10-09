const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
const db = new Database(path.join(dataDir, "shopping-david.db"));
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price INTEGER NOT NULL,
  image TEXT NOT NULL,
  description TEXT DEFAULT '',
  stock INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  price INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id)
);
`);


/* Add payment tracking fields to existing databases without deleting orders. */
const orderColumns = db.prepare("PRAGMA table_info(orders)").all().map(column => column.name);
if (!orderColumns.includes("payment_method")) {
  db.exec("ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'moniepoint_transfer'");
}
if (!orderColumns.includes("payment_reference")) {
  db.exec("ALTER TABLE orders ADD COLUMN payment_reference TEXT DEFAULT ''");
}
if (!orderColumns.includes("payment_status")) {
  db.exec("ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending_verification'");
}

const adminEmail = process.env.ADMIN_EMAIL || "admin@shoppingdavid.com";
const adminPassword = process.env.ADMIN_PASSWORD || "ChangeThisPassword123!";
const adminHash = bcrypt.hashSync(adminPassword, 12);
const existingAdmin = db.prepare("SELECT id FROM admins WHERE email = ?").get(adminEmail);
if (existingAdmin) {
  if (process.env.ADMIN_PASSWORD) {
    db.prepare("UPDATE admins SET password_hash = ? WHERE email = ?").run(adminHash, adminEmail);
  }
} else {
  const defaultAdmin = db.prepare("SELECT id FROM admins WHERE email = 'admin@shoppingdavid.com'").get();
  if (process.env.ADMIN_EMAIL && defaultAdmin) {
    db.prepare("UPDATE admins SET email = ?, password_hash = ? WHERE id = ?").run(adminEmail, adminHash, defaultAdmin.id);
  } else {
    db.prepare("INSERT INTO admins (email, password_hash) VALUES (?, ?)").run(adminEmail, adminHash);
  }
}

const count = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
if (count === 0) {
  const products = [
    [1,"Classic Denim Jacket","fashion",28500,"https://images.unsplash.com/photo-1576995853123-5a10305d93c0?auto=format&fit=crop&w=700&q=85","A versatile denim jacket for everyday style.",15],
    [2,"Premium Sneakers","fashion",42000,"https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=700&q=85","Comfortable sneakers for casual and active days.",12],
    [3,"Minimal Wrist Watch","fashion",31500,"https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=700&q=85","Clean, modern watch design.",10],
    [4,"Classic Hoodie","fashion",24000,"https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=700&q=85","Soft everyday hoodie with a relaxed fit.",20],
    [5,"Fresh Orange Drink","beverages",2500,"https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?auto=format&fit=crop&w=700&q=85","Refreshing citrus drink for any occasion.",30],
    [6,"Premium Coffee","beverages",6500,"https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=700&q=85","Rich roasted coffee for your daily cup.",25],
    [7,"Sparkling Water","beverages",1800,"https://images.unsplash.com/photo-1559839914-17aae19cec71?auto=format&fit=crop&w=700&q=85","Crisp sparkling refreshment.",40],
    [8,"Wireless Headphones","gadgets",55000,"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=85","Immersive sound with comfortable ear cushions.",8],
    [9,"Smart Watch","gadgets",68000,"https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=700&q=85","A modern smartwatch for everyday activity.",7],
    [10,"Bluetooth Speaker","gadgets",39000,"https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=700&q=85","Portable sound for home and outdoors.",11],
    [11,"Power Bank","gadgets",22000,"https://images.unsplash.com/photo-1609592424722-0d8b1a3d6b50?auto=format&fit=crop&w=700&q=85","Reliable backup power on the go.",14],
    [12,"Everyday T-Shirt","fashion",12000,"https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=700&q=85","Comfortable cotton tee for everyday wear.",25],
    [13,"Laundry Detergent","daily-needs",6500,"https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=700&q=85","Everyday cleaning essential for your home.",20],
    [14,"Toilet Tissue Pack","daily-needs",4800,"https://images.unsplash.com/photo-1584556812952-905ffd0c611a?auto=format&fit=crop&w=700&q=85","Soft and practical household tissue.",18],
    [15,"Body Care Set","daily-needs",12500,"https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=700&q=85","Simple everyday personal-care essentials.",13],
    [16,"Household Essentials","daily-needs",9000,"https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=700&q=85","Useful supplies for your everyday home needs.",16]
  ];
  const insert = db.prepare("INSERT INTO products (id,name,category,price,image,description,stock) VALUES (?,?,?,?,?,?,?)");
  const seed = db.transaction(rows => rows.forEach(row => insert.run(...row)));
  seed(products);
}
module.exports = db;
