(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "bx-radar-products-v1";
  const SETTINGS_KEY = "bx-radar-settings-v1";
  const demoProducts = [
    {id:"demo-1",name:"UX-01 Dran Buster 1-60A",platform:"Amazon JP",stock:"unknown",price:1980,currency:"JPY",target:1600,url:""},
    {id:"demo-2",name:"BX-00 戰鬥陀螺 X 入門套組",platform:"玩具店",stock:"unknown",price:890,currency:"TWD",target:790,url:""},
    {id:"demo-3",name:"CX 系列對戰陀螺（示範項目）",platform:"Shopee 蝦皮",stock:"unknown",price:1290,currency:"TWD",target:1100,url:""}
  ];
  let products = loadProducts();
  let toastTimer;
  let deferredPrompt = null;
  function loadProducts() {
    try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY)); return Array.isArray(value) ? value : demoProducts.map(p => ({...p})); }
    catch (_) { return demoProducts.map(p => ({...p})); }
  }
  function saveProducts() { localStorage.setItem(STORAGE_KEY, JSON.stringify(products)); render(); }
  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (_) { return {}; }
  }
  function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }
  function money(value, currency) {
    const locale = currency === "JPY" ? "ja-JP" : "zh-TW";
    try { return new Intl.NumberFormat(locale, {style:"currency",currency,maximumFractionDigits: currency === "JPY" ? 0 : 2}).format(Number(value)||0); }
    catch (_) { return (currency === "JPY" ? "¥" : "NT$ ") + (Number(value)||0).toLocaleString(); }
  }
  function twd(value) { return "NT$ " + Math.round(Number(value)||0).toLocaleString("zh-TW"); }
  function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
  function validHttpUrl(raw) {
    if (!raw) return "";
    try { const url = new URL(raw); return ["http:","https:"].includes(url.protocol) ? url.href : ""; } catch (_) { return ""; }
  }
  function stockInfo(stock) {
    if (stock === "in") return {label:"示範：有貨", cls:"in"};
    if (stock === "out") return {label:"示範：缺貨", cls:"out"};
    return {label:"尚未確認", cls:""};
  }
  function priceText(p) { return p.price === "" || p.price == null ? "未填價格" : money(p.price,p.currency); }
  function render() {
    const query = $("searchInput").value.trim().toLocaleLowerCase();
    const platform = $("platformFilter").value;
    const status = $("statusFilter").value;
    const filtered = products.filter(p => {
      const matchesQuery = `${p.name} ${p.platform}`.toLocaleLowerCase().includes(query);
      return matchesQuery && (platform === "all" || p.platform === platform) && (status === "all" || p.stock === status);
    });
    $("productList").innerHTML = filtered.map(p => {
      const stock = stockInfo(p.stock);
      const targetHit = p.target !== "" && p.target != null && p.price !== "" && p.price != null && Number(p.price) <= Number(p.target);
      const targetLine = p.target !== "" && p.target != null ? `目標價：${escapeHTML(money(p.target,p.currency))}${targetHit ? " · 已達目標" : ""}` : "尚未設定目標價";
      const url = validHttpUrl(p.url);
      return `<article class="product-card">
        <div class="product-top"><span class="product-platform">${escapeHTML(p.platform)}</span><span class="stock-pill ${stock.cls}">${stock.label}</span></div>
        <h3 class="product-name">${escapeHTML(p.name)}</h3>
        <div class="price-row"><div><div class="price-label">目前記錄價格</div><div class="price-value">${escapeHTML(priceText(p))}</div><div class="target-note ${targetHit ? "hit" : ""}">${targetHit ? "✓ " : ""}${targetLine}</div></div><span class="price-label">${p.currency === "JPY" ? "日本 / JPY" : "台灣 / TWD"}</span></div>
        <div class="product-actions">${url ? `<a class="mini-btn accent" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">開啟賣場 ↗</a>` : `<button class="mini-btn" data-action="edit" data-id="${escapeHTML(p.id)}">新增／編輯網址</button>`}<button class="mini-btn" data-action="edit" data-id="${escapeHTML(p.id)}">編輯</button><button class="mini-btn" data-action="delete" data-id="${escapeHTML(p.id)}">刪除</button></div>
      </article>`;
    }).join("");
    $("productList").classList.toggle("hidden", filtered.length === 0);
    $("emptyState").classList.toggle("hidden", filtered.length !== 0);
    $("statCount").textContent = products.length;
    $("statTargets").textContent = products.filter(p => p.target !== "" && p.target != null).length;
    $("statStock").textContent = products.filter(p => p.stock === "in").length ? products.filter(p => p.stock === "in").length + " 項" : "未確認";
  }
  function toast(message) {
    $("toast").textContent = message; $("toast").classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2500);
  }
  function openForm(product) {
    $("productForm").reset();
    $("productId").value = product?.id || "";
    $("dialogTitle").textContent = product ? "編輯追蹤商品" : "新增追蹤商品";
    $("productName").value = product?.name || "";
    $("productPlatform").value = product?.platform || "Shopee 蝦皮";
    $("productStock").value = product?.stock || "unknown";
    $("productPrice").value = product?.price ?? "";
    $("productCurrency").value = product?.currency || "TWD";
    $("productTarget").value = product?.target ?? "";
    $("productUrl").value = product?.url || "";
    $("productDialog").showModal();
  }
  function closeForm() { $("productDialog").close(); }
  function calculate() {
    const price = Math.max(0,Number($("jpyPrice").value)||0);
    const rate = Math.max(0,Number($("fxRate").value)||0);
    const shipping = Math.max(0,Number($("shipping").value)||0);
    const fees = Math.max(0,Number($("otherFees").value)||0);
    const converted = price*rate;
    $("convertedCost").textContent = twd(converted);
    $("feeCost").textContent = twd(shipping+fees);
    $("totalCost").textContent = twd(converted+shipping+fees);
  }
  function initSettings() {
    const settings = loadSettings();
    $("alertsToggle").checked = Boolean(settings.alerts);
    $("settingsFeedback").textContent = settings.alerts ? "已開啟本機提醒偏好；尚未連接背景監控或推播服務。" : "提醒設定會儲存在這台裝置的瀏覽器中。";
  }
  function addHandlers() {
    ["addBtn","addTopBtn","emptyAddBtn"].forEach(id => $(id).addEventListener("click", () => openForm(null)));
    $("closeDialog").addEventListener("click", closeForm);
    $("cancelDialog").addEventListener("click", closeForm);
    ["searchInput","platformFilter","statusFilter"].forEach(id => $(id).addEventListener(id==="searchInput"?"input":"change", render));
    $("productForm").addEventListener("submit", event => {
      event.preventDefault();
      const name = $("productName").value.trim();
      if (!name) { toast("請輸入商品名稱"); return; }
      const rawUrl = $("productUrl").value.trim();
      const url = validHttpUrl(rawUrl);
      if (rawUrl && !url) { toast("請輸入有效的 http 或 https 商品網址"); return; }
      const id = $("productId").value || `p-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
      const product = {id,name,platform:$("productPlatform").value,stock:$("productStock").value,price:$("productPrice").value===""?"":Number($("productPrice").value),currency:$("productCurrency").value,target:$("productTarget").value===""?"":Number($("productTarget").value),url};
      const index = products.findIndex(p => p.id === id);
      if (index >= 0) products[index] = product; else products.unshift(product);
      saveProducts(); closeForm(); toast("商品已儲存到這台裝置");
    });
    $("productList").addEventListener("click", event => {
      const btn = event.target.closest("button[data-action]"); if (!btn) return;
      const product = products.find(p => p.id === btn.dataset.id); if (!product) return;
      if (btn.dataset.action === "edit") openForm(product);
      if (btn.dataset.action === "delete" && confirm(`確定刪除「${product.name}」？`)) {
        products = products.filter(p => p.id !== product.id); saveProducts(); toast("商品已刪除");
      }
    });
    ["jpyPrice","fxRate","shipping","otherFees"].forEach(id => $(id).addEventListener("input", calculate));
    $("alertsToggle").addEventListener("change", () => {
      const settings = loadSettings(); settings.alerts = $("alertsToggle").checked; saveSettings(settings);
      $("settingsFeedback").textContent = settings.alerts ? "已記錄提醒偏好；本版本尚無背景監控或推播，請勿把它當成即時通知。" : "提醒偏好已關閉。";
    });
    $("autoBuyToggle").addEventListener("change", () => { $("autoBuyToggle").checked = false; toast("自動購買尚未開放：需先接入正式 API 與授權"); });
    window.addEventListener("beforeinstallprompt", event => {
      event.preventDefault(); deferredPrompt = event; $("installBtn").classList.remove("hidden");
    });
    $("installBtn").addEventListener("click", async () => {
      if (!deferredPrompt) { toast("在 iPhone 請用 Safari「分享」→「加入主畫面」"); return; }
      deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $("installBtn").classList.add("hidden");
    });
  }
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
  addHandlers(); initSettings(); render(); calculate();
})();