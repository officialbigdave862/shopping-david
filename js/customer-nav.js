(function () {
  "use strict";
  const escapeHTML = value => String(value || "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[ch]));

  async function updateCustomerNavigation() {
    const header = document.querySelector("header.header, header");
    if (!header) return;

    let customer = null;
    try {
      const response = await fetch("/api/customer/me", { credentials: "same-origin" });
      if (response.ok) {
        const data = await response.json();
        if (data && data.authenticated && data.customer) customer = data.customer;
      }
    } catch (_) {}

    // Remove old account/login links from different page layouts, including duplicates.
    header.querySelectorAll('a[href*="customer/login.php"], a[href*="customer/account.html"], a.customer-nav-link')
      .forEach(link => link.remove());

    const target = header.querySelector(".header-actions") || header.querySelector(".nav") || header;
    const link = document.createElement("a");
    link.className = "customer-nav-link";
    link.href = customer ? "/customer/account.html" : "/customer/login.php";
    link.textContent = customer
      ? "Hi, " + (customer.name || customer.email || "Customer").trim().split(/\s+/)[0]
      : "Login / Sign up";
    link.setAttribute("aria-label", customer ? "Open your customer account" : "Log in or create an account");
    target.appendChild(link);

    if (!document.getElementById("customer-nav-style")) {
      const style = document.createElement("style");
      style.id = "customer-nav-style";
      style.textContent = ".customer-nav-link{display:inline-flex;align-items:center;justify-content:center;gap:6px;margin-left:12px;padding:8px 12px;border:1px solid #e2e6ed;border-radius:8px;color:#172033;background:#fff;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap}.customer-nav-link:hover{background:#f4f6fa}.header .customer-nav-link{flex-shrink:0}@media(max-width:700px){.customer-nav-link{margin-left:4px;padding:7px 9px;font-size:12px}}";
      document.head.appendChild(style);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateCustomerNavigation);
  } else {
    updateCustomerNavigation();
  }
  // Refresh the displayed account state when the visitor returns to a page.
  window.addEventListener("pageshow", updateCustomerNavigation);
})();