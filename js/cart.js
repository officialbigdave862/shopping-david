(function () {
  "use strict";
  const itemsNode = document.getElementById("cartItems");
  const summaryNode = document.getElementById("cartSummary");
  if (!itemsNode || !summaryNode) return;

  const cartKey = "shoppingDavidCart";
  const money = window.formatShoppingDavidMoney || (n => "₦" + Number(n || 0).toLocaleString("en-NG"));
  const escapeHtml = value => String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  function getCart() { return window.getShoppingDavidCart ? window.getShoppingDavidCart() : JSON.parse(localStorage.getItem(cartKey) || "[]"); }
  function saveCart(cart) { if (window.saveShoppingDavidCart) window.saveShoppingDavidCart(cart); else localStorage.setItem(cartKey, JSON.stringify(cart)); }
  function render() {
    const cart = getCart();
    const products = window.PRODUCTS || [];
    const lines = cart.map(item => {
      const product = products.find(p => Number(p.id) === Number(item.id));
      if (!product) return null;
      return {product, qty:Math.max(1, Number(item.qty) || 1)};
    }).filter(Boolean);
    if (!lines.length) {
      itemsNode.innerHTML = '<div class="empty"><h3>Your cart is empty</h3><p>Browse our products and add something you like.</p><a class="btn btn-primary" href="shop.html">Browse products</a></div>';
      summaryNode.innerHTML = "";
      return;
    }
    itemsNode.innerHTML = lines.map(({product,qty}) => '<article class="cart-item"><img src="' + escapeHtml(product.image || product.image_url || "") + '" alt="' + escapeHtml(product.name) + '"><div class="cart-item-info"><h3>' + escapeHtml(product.name) + '</h3><strong>' + money(product.price) + '</strong><div class="qty"><button type="button" data-qty="-1" data-id="' + product.id + '" aria-label="Decrease quantity">−</button><span>' + qty + '</span><button type="button" data-qty="1" data-id="' + product.id + '" aria-label="Increase quantity">+</button></div></div><button class="remove" type="button" data-remove="' + product.id + '">Remove</button></article>').join("");
    const total = lines.reduce((sum,line) => sum + Number(line.product.price) * line.qty, 0);
    summaryNode.innerHTML = '<h2>Order summary</h2><div class="summary-line"><span>Items</span><span>' + lines.reduce((sum,line) => sum + line.qty,0) + '</span></div><div class="summary-total"><strong>Total</strong><strong>' + money(total) + '</strong></div><a class="btn btn-primary full" href="checkout.html">Proceed to checkout</a><a class="continue" href="shop.html">Continue shopping</a>';
  }
  document.addEventListener("click", function (event) {
    const remove = event.target.closest("[data-remove]");
    const quantity = event.target.closest("[data-qty]");
    if (!remove && !quantity) return;
    const cart = getCart();
    const id = Number((remove || quantity).getAttribute(remove ? "data-remove" : "data-id"));
    let next = cart;
    if (remove) next = cart.filter(item => Number(item.id) !== id);
    else next = cart.map(item => Number(item.id) === id ? Object.assign({},item,{qty:Math.max(1,(Number(item.qty)||1)+Number(quantity.getAttribute("data-qty")))}) : item);
    saveCart(next);
    render();
  });
  document.addEventListener("DOMContentLoaded", render);
  window.addEventListener("shoppingdavid:products-ready", render);
  render();
})();