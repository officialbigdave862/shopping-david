(function () {
  "use strict";
  let selectedCategory = "all";
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");
  const grid = document.getElementById("shop-products");
  const empty = document.getElementById("emptyState");
  if (!grid) return;

  function render() {
    let products = Array.isArray(window.PRODUCTS) ? window.PRODUCTS.slice() : [];
    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    if (selectedCategory !== "all") products = products.filter(p => p.category === selectedCategory);
    if (query) products = products.filter(p => (p.name + " " + (p.description || "") + " " + p.category).toLowerCase().includes(query));
    const sort = sortSelect ? sortSelect.value : "default";
    if (sort === "low") products.sort((a,b) => Number(a.price) - Number(b.price));
    else if (sort === "high") products.sort((a,b) => Number(b.price) - Number(a.price));
    else if (sort === "name") products.sort((a,b) => String(a.name).localeCompare(String(b.name)));
    grid.innerHTML = products.map(window.renderShoppingDavidProduct).join("");
    if (empty) empty.classList.toggle("hidden", products.length > 0);
    grid.classList.toggle("hidden", products.length === 0);
  }

  document.querySelectorAll(".filter[data-category]").forEach(button => {
    button.addEventListener("click", function () {
      selectedCategory = this.getAttribute("data-category") || "all";
      document.querySelectorAll(".filter[data-category]").forEach(b => b.classList.toggle("active", b === this));
      render();
    });
  });
  if (searchInput) searchInput.addEventListener("input", render);
  if (sortSelect) sortSelect.addEventListener("change", render);
  document.addEventListener("DOMContentLoaded", render);
  window.addEventListener("shoppingdavid:products-ready", render);
  render();
})();