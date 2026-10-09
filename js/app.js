(function () {
  "use strict";
  const CART_KEY = "shoppingDavidCart";
  const money = value => "₦" + Number(value || 0).toLocaleString("en-NG");
  const escapeHtml = value => String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));

  window.formatShoppingDavidMoney = money;
  window.getShoppingDavidCart = function () {
    try {
      const cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(cart) ? cart : [];
    } catch (_) { return []; }
  };
  window.saveShoppingDavidCart = function (cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    window.updateCartCount();
  };
  window.updateCartCount = function () {
    const count = window.getShoppingDavidCart().reduce((sum, item) => sum + Math.max(1, Number(item.qty) || 1), 0);
    document.querySelectorAll(".cart-count").forEach(el => { el.textContent = String(count); });
  };
  function addProductToCart(id) {
    const product = (window.PRODUCTS || []).find(p => Number(p.id) === Number(id));
    if (!product) { alert("This product is not available right now. Please refresh the page."); return; }
    const cart = window.getShoppingDavidCart();
    const existing = cart.find(item => Number(item.id) === Number(id));
    if (existing) existing.qty = (Number(existing.qty) || 1) + 1;
    else cart.push({id:Number(id), qty:1});
    window.saveShoppingDavidCart(cart);
    let toast = document.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = product.name + " added to cart";
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 2200);
  }

  window.addToCart = async function (id) {
    try {
      const response = await fetch("/api/customer/me", { credentials: "same-origin", cache: "no-store" });
      const data = response.ok ? await response.json() : null;
      if (!data || !data.authenticated || !data.customer) {
        sessionStorage.setItem("shoppingDavidPendingAdd", String(id));
        const next = window.location.pathname + window.location.search;
        window.location.href = "/customer/login.php?next=" + encodeURIComponent(next);
        return;
      }
      addProductToCart(id);
    } catch (_) {
      alert("We couldn't check your login. Please refresh the page and try again.");
    }
  };

  let processingPendingAdd = false;
  async function processPendingAdd() {
    const pendingId = sessionStorage.getItem("shoppingDavidPendingAdd");
    if (!pendingId || processingPendingAdd) return;
    processingPendingAdd = true;
    try {
      const response = await fetch("/api/customer/me", { credentials: "same-origin", cache: "no-store" });
      const data = response.ok ? await response.json() : null;
      if (!data || !data.authenticated || !data.customer) return;
      if (!(window.PRODUCTS || []).some(p => Number(p.id) === Number(pendingId))) return;
      sessionStorage.removeItem("shoppingDavidPendingAdd");
      addProductToCart(pendingId);
    } catch (_) {}
    finally { processingPendingAdd = false; }
  }

  window.renderShoppingDavidProduct = function (product) {
    const name = escapeHtml(product.name);
    const category = escapeHtml(String(product.category || "product").replace(/-/g, " "));
    const image = escapeHtml(product.image || product.image_url || "");
    const description = escapeHtml(product.description || "A quality pick for everyday life.");
    const price = money(product.price);
    return '<article class="product-card">' +
      '<a class="product-image" href="shop.html" aria-label="View ' + name + '">' +
      '<img src="' + image + '" alt="' + name + '" loading="lazy" onerror="this.onerror=null;this.src=\'https://placehold.co/600x500/f3f4f6/172033?text=SHOPPING+DAVID\';">' +
      '</a><div class="product-info"><span class="tag">' + category + '</span><h3>' + name + '</h3>' +
      '<p class="product-desc">' + description + '</p><div class="product-bottom"><strong>' + price + '</strong>' +
      '<button class="add-btn" type="button" data-add-to-cart="' + Number(product.id) + '">Add to cart</button></div></div></article>';
  };

  function renderFeatured() {
    const target = document.getElementById("featured-products");
    if (!target || !Array.isArray(window.PRODUCTS)) return;
    target.innerHTML = window.PRODUCTS.slice(0, 4).map(window.renderShoppingDavidProduct).join("");
  }

  document.addEventListener("click", function (event) {
    const addButton = event.target.closest("[data-add-to-cart]");
    if (addButton) {
      event.preventDefault();
      window.addToCart(addButton.getAttribute("data-add-to-cart"));
    }
    const menuButton = event.target.closest(".menu-toggle");
    if (menuButton) {
      const nav = document.querySelector(".nav");
      if (nav) nav.classList.toggle("open");
    }
  });

  document.addEventListener("DOMContentLoaded", function () {
    window.updateCartCount();
    renderFeatured();
    processPendingAdd();
  });
  window.addEventListener("shoppingdavid:products-ready", function () {
    renderFeatured();
    processPendingAdd();
  });
})();