(function () {
  "use strict";

  const fallbackProducts = [
    {id:1,name:"Classic Denim Jacket",category:"fashion",price:28500,image:"https://images.unsplash.com/photo-1576995853123-5a10305d93c0?auto=format&fit=crop&w=700&q=85",description:"A versatile denim jacket for everyday style.",stock:15},
    {id:2,name:"Premium Sneakers",category:"fashion",price:42000,image:"https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=700&q=85",description:"Comfortable sneakers for casual and active days.",stock:12},
    {id:3,name:"Minimal Wrist Watch",category:"fashion",price:31500,image:"https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=700&q=85",description:"Clean, modern watch design.",stock:10},
    {id:4,name:"Classic Hoodie",category:"fashion",price:24000,image:"https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=700&q=85",description:"Soft everyday hoodie with a relaxed fit.",stock:20},
    {id:5,name:"Fresh Orange Drink",category:"beverages",price:2500,image:"https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?auto=format&fit=crop&w=700&q=85",description:"Refreshing citrus drink for any occasion.",stock:30},
    {id:6,name:"Premium Coffee",category:"beverages",price:6500,image:"https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=700&q=85",description:"Rich roasted coffee for your daily cup.",stock:25},
    {id:7,name:"Sparkling Water",category:"beverages",price:1800,image:"https://images.unsplash.com/photo-1559839914-17aae19cec71?auto=format&fit=crop&w=700&q=85",description:"Crisp sparkling refreshment.",stock:40},
    {id:8,name:"Wireless Headphones",category:"gadgets",price:55000,image:"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=85",description:"Immersive sound with comfortable ear cushions.",stock:8},
    {id:9,name:"Smart Watch",category:"gadgets",price:68000,image:"https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=700&q=85",description:"A modern smartwatch for everyday activity.",stock:7},
    {id:10,name:"Bluetooth Speaker",category:"gadgets",price:39000,image:"https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=700&q=85",description:"Portable sound for home and outdoors.",stock:11},
    {id:11,name:"Power Bank",category:"gadgets",price:22000,image:"https://images.unsplash.com/photo-1609592424722-0d8b1a3d6b50?auto=format&fit=crop&w=700&q=85",description:"Reliable backup power on the go.",stock:14},
    {id:12,name:"Everyday T-Shirt",category:"fashion",price:12000,image:"https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=700&q=85",description:"Comfortable cotton tee for everyday wear.",stock:25},
    {id:13,name:"Laundry Detergent",category:"daily-needs",price:6500,image:"https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=700&q=85",description:"Everyday cleaning essential for your home.",stock:20},
    {id:14,name:"Toilet Tissue Pack",category:"daily-needs",price:4800,image:"https://images.unsplash.com/photo-1584556812952-905ffd0c611a?auto=format&fit=crop&w=700&q=85",description:"Soft and practical household tissue.",stock:18},
    {id:15,name:"Body Care Set",category:"daily-needs",price:12500,image:"https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=700&q=85",description:"Simple everyday personal-care essentials.",stock:13},
    {id:16,name:"Household Essentials",category:"daily-needs",price:9000,image:"https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=700&q=85",description:"Useful supplies for your everyday home needs.",stock:16}
  ];

  window.PRODUCTS = fallbackProducts;

  window.dispatchEvent(new CustomEvent("shoppingdavid:products-ready", {detail:{products:window.PRODUCTS, source:"fallback"}}));

  fetch("/api/products", { cache: "no-store", headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" } })
    .then(function (response) {
      if (!response.ok) throw new Error("Product API returned HTTP " + response.status);
      return response.json();
    })
    .then(function (products) {
      if (!Array.isArray(products) || products.length === 0) return;
      window.PRODUCTS = products.map(function (p) {
        return Object.assign({}, p, {
          id: Number(p.id),
          price: Number(p.price),
          image: p.image || p.image_url || "",
          stock: Number(p.stock || 0)
        });
      });
      window.dispatchEvent(new CustomEvent("shoppingdavid:products-ready", {detail:{products:window.PRODUCTS, source:"api"}}));
    })
    .catch(function (error) {
      console.warn("Using built-in SHOPPING DAVID product list because the product API is unavailable.", error.message);
    });
})();