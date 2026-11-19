/* Stream Zone store: accounts, product pages, cart, checkout, orders and complaints.
   Runs after the homepage script and reuses its products, cart and helpers. */

/* ====== YOUR PAYMENT DETAILS (shown at checkout and on the order page) ======
   Fill in title and number. Leave number "" to tell customers you'll send it on WhatsApp. */
const PAYMENT_ACCOUNTS = {
  Easypaisa: { title: "Muhammad Afaq", number: "03094839648" },
  JazzCash:  { title: "Muhammad Afaq", number: "03094839648" },
};
/* ============================================================================ */

(() => {
const cfg = window.STREAMZONE_SUPABASE || {};
const sb = window.supabase && cfg.url ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;
const V = document.getElementById("view");
const MAIN = document.getElementById("top");
const STATUS_CLASS = { "Awaiting payment":"warn", "Under review":"info", "Approved":"ok", "Delivered":"ok", "Rejected":"bad", "Cancelled":"grey",
                       "Open":"warn", "In progress":"info", "Resolved":"ok", "Closed":"grey" };
const pill = s => `<span class="pill ${STATUS_CLASS[s] || ""}">${esc(s)}</span>`;
const fmtDate = d => new Date(d).toLocaleString("en-PK", { day:"numeric", month:"short", year:"numeric", hour:"numeric", minute:"2-digit" });
const money = n => rs(Number(n));
const qs = () => new URLSearchParams((location.hash.split("?")[1]) || "");
let session = null, user = null;

/* ---------- small helpers ---------- */
const loading = () => { V.innerHTML = `<div class="loading"><span class="spin"></span></div>`; };
const crumbs = (...parts) => `<nav class="crumbs" aria-label="Breadcrumb"><a href="#top">Home</a>${parts.map(p => ` › ${p}`).join("")}</nav>`;
const go = h => { if (location.hash === h) route(); else location.hash = h; };
const saveCart = () => { store.set("sz_cart", cart); renderCart(); };
const optLabel = (p, i) => p.options ? p.options[i].label : "";
const needLogin = next => { go("#/login?next=" + encodeURIComponent(next)); };
function errText(e){ const m = (e && (e.message || e.error_description)) || String(e); return m.replace(/^.*?exception:\s*/i, ""); }
function payBox(method){
  const a = PAYMENT_ACCOUNTS[method] || {};
  if (!a.number) return `<div class="acct">We'll send our ${esc(method)} account number on WhatsApp as soon as you place the order. <a href="${waLink("Assalam o Alaikum, please send your " + method + " account details.")}" target="_blank" rel="noopener">Ask on WhatsApp now</a></div>`;
  return `<div class="acct"><span>${esc(method)} account</span><b>${esc(a.number)} <button type="button" class="copy" data-copy="${esc(a.number)}">Copy</button></b><span>Account title: ${esc(a.title)}</span></div>`;
}
document.addEventListener("click", e => {
  const c = e.target.closest("[data-copy]");
  if (c) { navigator.clipboard && navigator.clipboard.writeText(c.dataset.copy).then(() => toast("Copied")); }
});

/* ---------- header, mobile bar and cart drawer hooks ---------- */
const hacts = document.querySelector(".hacts");
if (hacts) {
  hacts.querySelector(".hact.help")?.remove();
  hacts.insertAdjacentHTML("beforeend", `<a class="hact" href="#/account" id="accBtn" aria-label="My account">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
    <span class="t"><b id="accName">My Account</b><small id="accSub">Login or register</small></span></a>`);
}
const savedTab = document.querySelector(".tabbar [data-open-saved]");
if (savedTab) savedTab.outerHTML = `<a href="#/account"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>Account</a>`;
const cartTab = document.querySelector(".tabbar [data-open-cart]");
if (cartTab) { cartTab.removeAttribute("data-open-cart"); cartTab.addEventListener("click", () => go("#/cart")); }
const ordersCol = [...document.querySelectorAll(".fmain h4")].find(h => /My orders/.test(h.textContent));
if (ordersCol) ordersCol.parentElement.insertAdjacentHTML("beforeend", `<a href="#/account/orders">Track my orders</a><a href="#/account/complaints">Complaints</a><a href="#/account">My account</a>`);
const checkoutForm = document.getElementById("checkout");
if (checkoutForm) checkoutForm.innerHTML = `<div class="total"><span>Total</span><span data-total>Rs 0</span></div>
  <a class="btn" href="#/checkout" data-close>Proceed to checkout</a><a class="btn outline" href="#/cart" data-close>View cart</a>
  <p class="hint">You'll see payment details at checkout. Your order is confirmed after we check your payment.</p>`;
renderCart();

/* product clicks open the product page instead of the popup */
window.addEventListener("click", e => {
  const t = e.target.closest("[data-save],[data-add],[data-view]");
  if (!t || t.dataset.save || t.dataset.add || !t.dataset.view) return;
  e.preventDefault(); e.stopPropagation();
  closeLayers();
  go("#/product/" + t.dataset.view);
}, true);

/* ---------- router ---------- */
function show(viewOn){ V.hidden = !viewOn; MAIN.hidden = viewOn; }
async function route(){
  const h = location.hash || "";
  if (!h.startsWith("#/")) {
    show(false);
    if (h && h.length > 1 && !h.includes("access_token")) { const el = document.getElementById(h.slice(1)); el && el.scrollIntoView(); }
    return;
  }
  show(true); window.scrollTo(0, 0);
  const [path] = h.slice(1).split("?");
  const seg = path.split("/").filter(Boolean);
  try {
    if (seg[0] === "product") return viewProduct(seg[1]);
    if (seg[0] === "cart") return viewCart();
    if (seg[0] === "login" || seg[0] === "register" || seg[0] === "forgot") return viewAuth(seg[0]);
    if (seg[0] === "reset") return viewReset();
    if (!sb) { V.innerHTML = `<div class="panel">Accounts are not available right now. Please order on WhatsApp.</div>`; return; }
    if (!session) return needLogin(path);
    if (seg[0] === "checkout") return viewCheckout();
    if (seg[0] === "orders" && seg[1]) return viewOrder(decodeURIComponent(seg[1]));
    if (seg[0] === "complaints" && seg[1] === "new") return viewNewComplaint();
    if (seg[0] === "complaints" && seg[1]) return viewComplaint(decodeURIComponent(seg[1]));
    if (seg[0] === "account") return viewAccount(seg[1] || "dashboard");
    go("#/account");
  } catch (e) { V.innerHTML = `<div class="panel"><p class="msg err">${esc(errText(e))}</p></div>`; }
}
window.addEventListener("hashchange", route);

/* ---------- auth state ---------- */
function paintAccount(){
  const n = document.getElementById("accName"), s = document.getElementById("accSub");
  if (!n) return;
  if (user) { n.textContent = (user.user_metadata && user.user_metadata.full_name) || "My Account"; s.textContent = "Orders and complaints"; }
  else { n.textContent = "My Account"; s.textContent = "Login or register"; }
}
async function initAuth(){
  if (!sb) { route(); return; }
  const { data } = await sb.auth.getSession();
  session = data.session; user = session && session.user; paintAccount();
  sb.auth.onAuthStateChange((ev, s) => {
    const was = !!session;
    session = s; user = s && s.user; paintAccount();
    if (ev === "PASSWORD_RECOVERY") go("#/reset");
    if (ev === "SIGNED_IN" && !was && /access_token|type=signup/.test(location.hash + location.search)) { toast("Email confirmed. You're signed in."); go("#/account"); }
  });
  route();
}

/* ---------- product page ---------- */
function viewProduct(id){
  const p = byId(id);
  if (!p) { V.innerHTML = crumbs("Not found") + `<div class="panel empty-box"><b>Product not found</b><a class="btn dark" href="#all">See all products</a></div>`; return; }
  const pk = p.options ? p.options.map((o, i) => ({ i, name: o.label, price: o.price })) : [{ i: null, name: "1 Month plan", price: p.price }];
  let sel = 0, qty = 1;
  const feats = (p.feats || []);
  const related = PRODUCTS.filter(x => x.cat === p.cat && x.id !== p.id).slice(0, 4);
  document.title = `${p.name} Price in Pakistan | Stream Zone`;
  V.innerHTML = crumbs(`<a href="#all" data-filter="${p.cat}">${esc(catOf(p.cat).name)}</a>`, esc(p.name)) + `
  <div class="pp">
    <div>
      <section class="panel">
        <div class="pp-head">${tile(p)}
          <div><div class="tags"><span class="pill">${esc(catOf(p.cat).name)}</span><span class="pill ok">In stock</span></div>
          <h1>${esc(p.name)} subscription in Pakistan</h1><p>${esc(p.desc)}</p></div>
        </div>
      </section>
      <section class="panel">
        <h2>Choose your plan</h2>
        <p class="sub">Select a package to see its price. Your plan is activated after we check your payment.</p>
        <div class="pkgs" role="radiogroup" aria-label="Packages">
          ${pk.map((k, n) => `<button type="button" class="pkg" role="radio" data-pk="${n}" aria-checked="${n === 0}">
            <b>${esc(k.name)}</b><span class="dur">1 Month</span><span class="pp-price">${money(k.price)}</span>
            ${feats.length ? `<ul>${feats.map(f => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
            <span class="dl">Delivery after payment approval</span></button>`).join("")}
        </div>
      </section>
      <section class="panel">
        <h2>What's included</h2>
        <ul class="incl">
          ${feats.map(f => `<li>${esc(f)}</li>`).join("")}
          <li>1 month of access from activation</li>
          <li>Login details or invite sent to your Stream Zone account and WhatsApp</li>
          <li>Support and replacement help through your account's Complaints page</li>
        </ul>
      </section>
      <section class="panel">
        <h2>Payment and activation</h2>
        <ol class="steps-list">
          <li>Choose a package and tap <b>Buy now</b> or <b>Add to cart</b>.</li>
          <li>Sign in, then pay with Easypaisa or JazzCash using the details shown at checkout.</li>
          <li>Upload a screenshot of your payment receipt on your order page.</li>
          <li>We check your payment and send your login details to your order page.</li>
        </ol>
      </section>
    </div>
    <aside class="panel summary" aria-label="Order summary">
      <h2>Order summary</h2>
      <div class="sumrow"><span>${esc(p.name)}</span><span class="muted" id="sPk"></span></div>
      <div class="sumrow"><span>Unit price</span><b id="sUnit"></b></div>
      <div class="sumrow"><span>Months</span><span class="stepper-q"><button type="button" id="qMinus" aria-label="Fewer months">−</button><span id="sQty">1</span><button type="button" id="qPlus" aria-label="More months">+</button></span></div>
      <div class="sumrow total"><span>Total</span><span id="sTotal"></span></div>
      <div class="sum-acts">
        <button class="btn" id="buyNow">Buy now</button>
        <button class="btn dark" id="addCart">Add to cart</button>
        <a class="btn outline" target="_blank" rel="noopener" href="${waLink("Assalam o Alaikum, I have a question about " + p.name + ".")}">Ask on WhatsApp</a>
      </div>
    </aside>
  </div>
  ${related.length ? `<section class="sec"><div class="sh"><h2>Related products</h2></div><div class="grid">${related.map(card).join("")}</div></section>` : ""}`;
  const paint = () => {
    const k = pk[sel];
    V.querySelectorAll(".pkg").forEach((b, n) => b.setAttribute("aria-checked", n === sel));
    V.querySelector("#sPk").textContent = k.name;
    V.querySelector("#sUnit").textContent = money(k.price);
    V.querySelector("#sQty").textContent = qty;
    V.querySelector("#sTotal").textContent = money(k.price * qty);
  };
  V.querySelectorAll(".pkg").forEach(b => b.addEventListener("click", () => { sel = +b.dataset.pk; paint(); }));
  V.querySelector("#qMinus").addEventListener("click", () => { qty = Math.max(1, qty - 1); paint(); });
  V.querySelector("#qPlus").addEventListener("click", () => { qty = Math.min(12, qty + 1); paint(); });
  const add = () => {
    const opt = pk[sel].i;
    const ex = cart.find(l => l.id === p.id && l.opt === opt);
    if (ex) ex.qty = Math.min(12, ex.qty + qty); else cart.push({ id: p.id, opt, qty });
    saveCart();
  };
  V.querySelector("#addCart").addEventListener("click", () => { add(); toast(`${p.name} added to cart`); });
  V.querySelector("#buyNow").addEventListener("click", () => { add(); go("#/checkout"); });
  paint();
}

/* ---------- cart page ---------- */
function cartLines(editable){
  return cart.map((l, i) => { const p = byId(l.id); return `<div class="citem">${tile(p)}
    <div><b>${esc(p.name)}</b><span class="opt">${esc(p.options ? p.options[l.opt].label : "1 Month plan")} · ${money(linePrice(l))} per month</span>
    ${editable ? `<div class="ctr"><span class="stepper-q"><button type="button" data-cdec="${i}" aria-label="Fewer months">−</button><span>${l.qty}</span><button type="button" data-cinc="${i}" aria-label="More months">+</button></span><button type="button" class="linkbtn" data-crm="${i}">Remove</button></div>` : `<span class="opt">${l.qty} ${l.qty === 1 ? "month" : "months"}</span>`}</div>
    <span class="lp">${money(linePrice(l) * l.qty)}</span></div>`; }).join("");
}
function viewCart(){
  document.title = "Your cart | Stream Zone";
  if (!cart.length) { V.innerHTML = crumbs("Cart") + `<div class="panel empty-box"><b>Your cart is empty</b>Add a subscription to start an order.<br><a class="btn dark" href="#all">Browse products</a></div>`; return; }
  V.innerHTML = crumbs("Cart") + `<div class="two">
    <section class="panel"><h2>Your cart</h2><p class="sub">${cart.reduce((s, l) => s + l.qty, 0)} item(s)</p>${cartLines(true)}</section>
    <aside class="panel summary"><h2>Order summary</h2>
      <div class="sumrow"><span>Subtotal</span><b>${money(cartTotal())}</b></div>
      <div class="sumrow total"><span>Total</span><span>${money(cartTotal())}</span></div>
      <div class="sum-acts"><a class="btn" href="#/checkout">Proceed to checkout</a><a class="btn outline" href="#all">Continue shopping</a></div>
    </aside></div>`;
  V.querySelectorAll("[data-cinc]").forEach(b => b.addEventListener("click", () => { const l = cart[+b.dataset.cinc]; l.qty = Math.min(12, l.qty + 1); saveCart(); viewCart(); }));
  V.querySelectorAll("[data-cdec]").forEach(b => b.addEventListener("click", () => { const l = cart[+b.dataset.cdec]; l.qty--; if (l.qty < 1) cart.splice(+b.dataset.cdec, 1); saveCart(); viewCart(); }));
  V.querySelectorAll("[data-crm]").forEach(b => b.addEventListener("click", () => { cart.splice(+b.dataset.crm, 1); saveCart(); viewCart(); }));
}

/* ---------- login / register / forgot / reset ---------- */
function viewAuth(mode){
  const next = qs().get("next") || "/account";
  if (session && mode !== "forgot") { go("#" + next); return; }
  document.title = (mode === "register" ? "Create account" : mode === "forgot" ? "Reset password" : "Sign in") + " | Stream Zone";
  const tabs = mode === "forgot" ? "" : `<div class="auth-tabs"><a href="#/login?next=${encodeURIComponent(next)}" ${mode === "login" ? 'aria-current="page"' : ""}>Login</a><a href="#/register?next=${encodeURIComponent(next)}" ${mode === "register" ? 'aria-current="page"' : ""}>Create account</a></div>`;
  const body = mode === "register" ? `
      <label>Full name<input name="name" autocomplete="name" required maxlength="120"></label>
      <label>WhatsApp number<input name="phone" type="tel" autocomplete="tel" placeholder="03xx xxxxxxx" required maxlength="20"></label>
      <label>Email<input name="email" type="email" autocomplete="email" required></label>
      <label>Password<input name="password" type="password" autocomplete="new-password" minlength="6" required><small>At least 6 characters.</small></label>
      <button class="btn full" type="submit">Create account</button>`
    : mode === "forgot" ? `
      <label>Email<input name="email" type="email" autocomplete="email" required></label>
      <button class="btn full" type="submit">Send reset link</button>`
    : `
      <label>Email<input name="email" type="email" autocomplete="email" required></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn full" type="submit">Login</button>
      <a href="#/forgot" style="font-size:14px">Forgot your password?</a>`;
  V.innerHTML = crumbs(mode === "register" ? "Create account" : mode === "forgot" ? "Reset password" : "Login") + `
    <div class="auth panel">${tabs}
      <h2>${mode === "register" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Welcome back"}</h2>
      <p class="sub">${mode === "register" ? "Track your orders, get your login details and raise complaints in one place." : mode === "forgot" ? "We'll email you a link to set a new password." : "Login to check out, track orders and raise complaints."}</p>
      <form class="form" novalidate>${body}<p class="msg" role="alert"></p></form>
    </div>`;
  const f = V.querySelector("form"), msg = V.querySelector(".msg"), btn = f.querySelector("button[type=submit]");
  f.addEventListener("submit", async e => {
    e.preventDefault(); msg.className = "msg"; msg.textContent = "";
    if (!f.checkValidity()) { msg.className = "msg err"; msg.textContent = mode === "register" ? "Fill in every field. The password needs at least 6 characters." : "Enter your email" + (mode === "login" ? " and password." : "."); return; }
    btn.disabled = true;
    try {
      const email = f.email.value.trim();
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email, password: f.password.value });
        if (error) throw error;
        toast("Signed in"); go("#" + next);
      } else if (mode === "register") {
        const { data, error } = await sb.auth.signUp({ email, password: f.password.value,
          options: { data: { full_name: f.name.value.trim(), phone: f.phone.value.trim() }, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (data.session) { toast("Account created"); go("#" + next); }
        else { f.innerHTML = `<p class="msg ok">Account created. We've sent a confirmation link to <b>${esc(email)}</b>. Open it to activate your account, then come back and login.</p><p class="muted" style="font-size:14px;margin:0">Can't find it? Check your spam folder.</p><a class="btn dark" href="#/login?next=${encodeURIComponent(next)}">Go to login</a>`; }
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        msg.className = "msg ok"; msg.textContent = "If that email has an account, a reset link is on its way. Check your inbox and spam folder.";
      }
    } catch (err) {
      msg.className = "msg err";
      const t = errText(err);
      msg.textContent = /Invalid login/i.test(t) ? "That email and password don't match. Try again or reset your password."
        : /not confirmed/i.test(t) ? "Confirm your email first. Open the link we sent you, then login."
        : /already registered/i.test(t) ? "An account with this email already exists. Login instead."
        : t;
    } finally { btn.disabled = false; }
  });
}
function viewReset(){
  V.innerHTML = crumbs("New password") + `<div class="auth panel"><h2>Set a new password</h2><p class="sub">Choose a password with at least 6 characters.</p>
    <form class="form" novalidate><label>New password<input name="password" type="password" autocomplete="new-password" minlength="6" required></label><button class="btn full" type="submit">Save password</button><p class="msg" role="alert"></p></form></div>`;
  const f = V.querySelector("form"), msg = V.querySelector(".msg");
  f.addEventListener("submit", async e => {
    e.preventDefault();
    if (!f.checkValidity()) { msg.className = "msg err"; msg.textContent = "The password needs at least 6 characters."; return; }
    const { error } = await sb.auth.updateUser({ password: f.password.value });
    if (error) { msg.className = "msg err"; msg.textContent = errText(error); return; }
    toast("Password saved"); go("#/account");
  });
}

/* ---------- checkout ---------- */
function viewCheckout(){
  document.title = "Checkout | Stream Zone";
  if (!cart.length) { V.innerHTML = crumbs("Checkout") + `<div class="panel empty-box"><b>Your cart is empty</b>Add a subscription before checking out.<br><a class="btn dark" href="#all">Browse products</a></div>`; return; }
  const md = user.user_metadata || {};
  V.innerHTML = crumbs(`<a href="#/cart">Cart</a>`, "Checkout") + `<form class="two" id="coForm" novalidate>
    <div>
      <section class="panel"><h2>Your details</h2><p class="sub">We'll use these to contact you about this order.</p>
        <div class="form"><div class="row2">
          <label>Full name<input name="name" required maxlength="120" value="${esc(md.full_name || "")}"></label>
          <label>WhatsApp number<input name="phone" type="tel" required maxlength="20" placeholder="03xx xxxxxxx" value="${esc(md.phone || "")}"></label></div>
          <label>Email<input value="${esc(user.email)}" disabled></label>
          <label>Note for us (optional)<textarea name="note" maxlength="1000" placeholder="For example, the email to invite for a plan"></textarea></label>
        </div></section>
      <section class="panel"><h2>Payment method</h2><p class="sub">Pay the total to the account below, then upload your receipt on the next page.</p>
        <div class="paym">
          ${["Easypaisa", "JazzCash"].map((m, i) => `<label class="payopt"><input type="radio" name="pay" value="${m}" ${i === 0 ? "checked" : ""}><span><img src="/assets/logos/${m.toLowerCase()}.svg" alt="">${m}<small>Mobile wallet transfer</small></span></label>`).join("")}
          <div id="acctBox"></div>
        </div></section>
    </div>
    <aside class="panel summary"><h2>Your order</h2>${cartLines(false)}
      <div class="sumrow total"><span>Total</span><span>${money(cartTotal())}</span></div>
      <p class="msg" role="alert" style="margin-top:12px"></p>
      <div class="sum-acts"><button class="btn" type="submit" id="placeBtn">Place order</button><a class="btn outline" href="#/cart">Edit cart</a></div>
      <p class="muted" style="font-size:13px;margin:12px 0 0">Your order is confirmed after we check your payment. Never share your wallet PIN or a verification code.</p>
    </aside></form>`;
  const f = V.querySelector("#coForm"), msg = V.querySelector(".msg"), btn = V.querySelector("#placeBtn");
  const paintAcct = () => { V.querySelector("#acctBox").innerHTML = payBox(f.pay.value); };
  f.querySelectorAll("input[name=pay]").forEach(r => r.addEventListener("change", paintAcct)); paintAcct();
  f.addEventListener("submit", async e => {
    e.preventDefault(); msg.className = "msg"; msg.textContent = "";
    const name = f.name.value.trim(), phone = f.phone.value.trim();
    if (!name || phone.replace(/\D/g, "").length < 10) { msg.className = "msg err"; msg.textContent = "Enter your name and a WhatsApp number with at least 10 digits."; return; }
    btn.disabled = true; btn.innerHTML = `<span class="spin"></span>`;
    try {
      const items = cart.map(l => ({ id: l.id, option: optLabel(byId(l.id), l.opt), qty: l.qty }));
      const { data, error } = await sb.from("shop_orders").insert({ customer_name: name, customer_phone: phone, items, payment_method: f.pay.value, customer_note: f.note.value.trim() || null, total: 0 }).select("order_ref").single();
      if (error) throw error;
      if (name !== md.full_name || phone !== md.phone) sb.auth.updateUser({ data: { full_name: name, phone } });
      cart = []; saveCart();
      toast("Order placed"); go("#/orders/" + data.order_ref + "?new=1");
    } catch (err) { msg.className = "msg err"; msg.textContent = "We couldn't place your order: " + errText(err); btn.disabled = false; btn.textContent = "Place order"; }
  });
}

/* ---------- order page ---------- */
async function viewOrder(ref){
  loading();
  const { data: o, error } = await sb.from("shop_orders").select("*").eq("order_ref", ref).maybeSingle();
  if (error) throw error;
  if (!o) { V.innerHTML = crumbs(`<a href="#/account/orders">My orders</a>`, "Not found") + `<div class="panel empty-box"><b>Order not found</b>This order isn't on your account.<br><a class="btn dark" href="#/account/orders">My orders</a></div>`; return; }
  document.title = `Order ${o.order_ref} | Stream Zone`;
  const st = o.status, isNew = qs().get("new") === "1";
  const steps = [["Order placed", true], ["Payment submitted", !!o.receipt_path || ["Approved","Delivered"].includes(st)], ["Approved", ["Approved","Delivered"].includes(st)], ["Delivered", st === "Delivered"]];
  const stopped = st === "Rejected" || st === "Cancelled";
  const canPay = ["Awaiting payment", "Rejected"].includes(st) || (st === "Under review");
  const waMsg = `Assalam o Alaikum, I placed order ${o.order_ref} (${money(o.total)}) and paid with ${o.payment_method}.`;
  V.innerHTML = crumbs(`<a href="#/account">My account</a>`, `<a href="#/account/orders">My orders</a>`, esc(o.order_ref)) + `
  ${isNew ? `<p class="msg ok" style="margin-bottom:16px">Order placed. Your order ID is <b>${esc(o.order_ref)}</b>. Pay ${money(o.total)} with ${esc(o.payment_method)}, then upload your receipt below.</p>` : ""}
  <div class="two">
    <div>
      <section class="panel">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
          <div><h2>Order ${esc(o.order_ref)}</h2><p class="sub" style="margin:0">Placed ${fmtDate(o.created_at)}</p></div>${pill(st)}
        </div>
        <ol class="timeline" style="margin-top:20px">${steps.map(([t, d], i) => `<li class="${d ? "done" : ""} ${stopped && !d && i === steps.findIndex(s => !s[1]) ? "stop" : ""}">${t}</li>`).join("")}</ol>
        ${stopped ? `<p class="msg err" style="margin-top:14px">${st === "Rejected" ? "We couldn't confirm your payment. " + (o.admin_note ? esc(o.admin_note) + " " : "") + "You can upload a new receipt below or raise a complaint." : "This order was cancelled."}</p>` : ""}
        ${!stopped && o.admin_note ? `<p class="msg info" style="margin-top:14px">${esc(o.admin_note)}</p>` : ""}
      </section>
      ${o.delivery_details ? `<section class="panel"><h2>Your login details</h2><p class="sub">Keep these private. Don't change the password or profile on shared accounts.</p><div class="deliv">${esc(o.delivery_details)}</div></section>` : ""}
      ${canPay ? `<section class="panel" id="paySec"><h2>${o.receipt_path ? "Payment receipt" : "Pay and upload your receipt"}</h2>
        <p class="sub">${o.receipt_path ? "We've received your receipt and are checking your payment. You can replace it if you uploaded the wrong file." : `Send <b>${money(o.total)}</b> with ${esc(o.payment_method)}, then upload a clear screenshot of the receipt.`}</p>
        ${o.receipt_path ? "" : payBox(o.payment_method)}
        <div class="upload" style="margin-top:14px"><input type="file" id="rcpt" accept="image/*,application/pdf"><small class="muted">JPG, PNG or PDF, up to 5 MB</small><button class="btn" id="upBtn" type="button">Upload receipt</button><p class="msg" id="upMsg" role="alert"></p></div>
        ${o.receipt_path ? `<p style="margin:12px 0 0"><button class="btn sm outline" id="seeRcpt" type="button">View uploaded receipt</button></p>` : ""}
      </section>` : (o.receipt_path ? `<section class="panel"><h2>Payment receipt</h2><button class="btn sm outline" id="seeRcpt" type="button">View uploaded receipt</button></section>` : "")}
      <section class="panel"><h2>Need help with this order?</h2><p class="sub">If your account stops working or something is wrong, raise a complaint and we'll reply on your account.</p>
        <div class="acts"><a class="btn dark" href="#/complaints/new?order=${encodeURIComponent(o.order_ref)}">Raise a complaint</a>
        <a class="btn outline" target="_blank" rel="noopener" href="${waLink(waMsg)}">Message us on WhatsApp</a>
        ${st === "Awaiting payment" ? `<button class="btn danger" id="cancelBtn" type="button">Cancel order</button>` : ""}</div>
      </section>
    </div>
    <aside class="panel summary"><h2>Order details</h2>
      ${o.items.map(it => `<div class="sumrow"><span>${esc(it.name)}${it.option ? `<br><small class="muted">${esc(it.option)}</small>` : ""}<br><small class="muted">${it.qty} × ${money(it.price)}</small></span><b>${money(it.line_total)}</b></div>`).join("")}
      <div class="sumrow total"><span>Total</span><span>${money(o.total)}</span></div>
      <dl class="kv" style="margin-top:14px"><dt>Payment</dt><dd>${esc(o.payment_method)}</dd><dt>Name</dt><dd>${esc(o.customer_name)}</dd><dt>WhatsApp</dt><dd>${esc(o.customer_phone)}</dd>${o.customer_note ? `<dt>Note</dt><dd>${esc(o.customer_note)}</dd>` : ""}</dl>
    </aside>
  </div>`;
  const see = V.querySelector("#seeRcpt");
  if (see) see.addEventListener("click", async () => { const { data, error } = await sb.storage.from("receipts").createSignedUrl(o.receipt_path, 300); if (error) return toast(errText(error)); window.open(data.signedUrl, "_blank", "noopener"); });
  const up = V.querySelector("#upBtn");
  if (up) up.addEventListener("click", async () => {
    const file = V.querySelector("#rcpt").files[0], m = V.querySelector("#upMsg");
    m.className = "msg"; m.textContent = "";
    if (!file) { m.className = "msg err"; m.textContent = "Choose your receipt screenshot first."; return; }
    if (file.size > 5 * 1024 * 1024) { m.className = "msg err"; m.textContent = "That file is over 5 MB. Upload a smaller screenshot."; return; }
    up.disabled = true; up.innerHTML = `<span class="spin"></span>`;
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
      const path = `${user.id}/${o.order_ref}-${Date.now()}.${ext}`;
      const { error: e1 } = await sb.storage.from("receipts").upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (e1) throw e1;
      const { error: e2 } = await sb.rpc("submit_receipt", { p_order: o.id, p_path: path });
      if (e2) throw e2;
      toast("Receipt uploaded. We'll check your payment."); viewOrder(ref);
    } catch (err) { m.className = "msg err"; m.textContent = "Upload failed: " + errText(err); up.disabled = false; up.textContent = "Upload receipt"; }
  });
  const cancel = V.querySelector("#cancelBtn");
  if (cancel) cancel.addEventListener("click", async () => {
    if (!confirm("Cancel this order? Only do this if you haven't paid.")) return;
    const { error } = await sb.rpc("cancel_order", { p_order: o.id });
    if (error) return toast(errText(error));
    toast("Order cancelled"); viewOrder(ref);
  });
}

/* ---------- account ---------- */
async function viewAccount(tab){
  loading();
  const [{ data: orders, error: e1 }, { data: tickets, error: e2 }] = await Promise.all([
    sb.from("shop_orders").select("id,order_ref,created_at,items,total,status").order("created_at", { ascending: false }),
    sb.from("complaints").select("id,ticket_ref,order_ref,subject,category,status,updated_at").order("updated_at", { ascending: false }),
  ]);
  if (e1 || e2) throw (e1 || e2);
  const md = user.user_metadata || {};
  const openT = tickets.filter(t => ["Open", "In progress"].includes(t.status)).length;
  const active = orders.filter(o => ["Awaiting payment", "Under review", "Approved"].includes(o.status)).length;
  document.title = "My account | Stream Zone";
  const nav = `<nav class="acc-nav" aria-label="Account">
    <div class="who"><b>${esc(md.full_name || "My account")}</b><small>${esc(user.email)}</small></div>
    <a href="#/account" ${tab === "dashboard" ? 'aria-current="page"' : ""}>Dashboard</a>
    <a href="#/account/orders" ${tab === "orders" ? 'aria-current="page"' : ""}>My orders ${orders.length ? `<span class="n">${orders.length}</span>` : ""}</a>
    <a href="#/account/complaints" ${tab === "complaints" ? 'aria-current="page"' : ""}>Complaints ${openT ? `<span class="n">${openT}</span>` : ""}</a>
    <a href="#/account/profile" ${tab === "profile" ? 'aria-current="page"' : ""}>Profile</a>
    <button type="button" id="logout">Logout</button></nav>`;
  const orderTable = list => list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Order ID</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>
      ${list.map(o => `<tr><td><a class="ref" href="#/orders/${encodeURIComponent(o.order_ref)}">${esc(o.order_ref)}</a></td><td>${new Date(o.created_at).toLocaleDateString("en-PK")}</td><td>${esc(o.items.map(i => i.name).join(", "))}</td><td>${money(o.total)}</td><td>${pill(o.status)}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty-box"><b>No orders yet</b>Your orders will show here with their status and login details.<br><a class="btn dark" href="#all">Browse products</a></div>`;
  const ticketTable = list => list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ticket</th><th>Subject</th><th>Order</th><th>Updated</th><th>Status</th></tr></thead><tbody>
      ${list.map(t => `<tr><td><a class="ref" href="#/complaints/${encodeURIComponent(t.ticket_ref)}">${esc(t.ticket_ref)}</a></td><td>${esc(t.subject)}<br><small class="muted">${esc(t.category)}</small></td><td>${esc(t.order_ref || "–")}</td><td>${new Date(t.updated_at).toLocaleDateString("en-PK")}</td><td>${pill(t.status)}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty-box"><b>No complaints</b>If something goes wrong with an order, raise a complaint and we'll reply here.</div>`;
  let body = "";
  if (tab === "orders") body = `<section class="panel"><h2>My orders</h2><p class="sub">Open an order to upload your receipt or see your login details.</p>${orderTable(orders)}</section>`;
  else if (tab === "complaints") body = `<section class="panel"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><div><h2>Complaints</h2><p class="sub" style="margin:0">Report a problem with an order and follow our replies.</p></div><a class="btn dark sm" href="#/complaints/new">Raise a complaint</a></div><div style="margin-top:16px">${ticketTable(tickets)}</div></section>`;
  else if (tab === "profile") body = `<section class="panel"><h2>Profile</h2><p class="sub">Update the details we use to contact you.</p>
      <form class="form" id="profForm" novalidate><div class="row2"><label>Full name<input name="name" maxlength="120" value="${esc(md.full_name || "")}"></label><label>WhatsApp number<input name="phone" type="tel" maxlength="20" value="${esc(md.phone || "")}"></label></div>
      <label>Email<input value="${esc(user.email)}" disabled></label><div><button class="btn" type="submit">Save details</button></div><p class="msg" role="alert"></p></form></section>
      <section class="panel"><h2>Change password</h2><form class="form" id="pwForm" novalidate><label>New password<input name="password" type="password" minlength="6" autocomplete="new-password"></label><div><button class="btn dark" type="submit">Change password</button></div><p class="msg" role="alert"></p></form></section>`;
  else body = `<div class="stats"><div class="stat"><b>${orders.length}</b><span>Total orders</span></div><div class="stat"><b>${active}</b><span>Orders in progress</span></div><div class="stat"><b>${openT}</b><span>Open complaints</span></div></div>
      <section class="panel"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><h2>Recent orders</h2><a href="#/account/orders" style="font-weight:700;font-size:14px">View all</a></div>${orderTable(orders.slice(0, 5))}</section>
      <section class="panel"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><h2>Recent complaints</h2><a class="btn dark sm" href="#/complaints/new">Raise a complaint</a></div>${ticketTable(tickets.slice(0, 3))}</section>`;
  V.innerHTML = crumbs("My account") + `<div class="acc">${nav}<div>${body}</div></div>`;
  V.querySelector("#logout").addEventListener("click", async () => { await sb.auth.signOut(); toast("Logged out"); go("#top"); });
  const pf = V.querySelector("#profForm");
  if (pf) pf.addEventListener("submit", async e => { e.preventDefault(); const m = pf.querySelector(".msg"); const { error } = await sb.auth.updateUser({ data: { full_name: pf.name.value.trim(), phone: pf.phone.value.trim() } }); m.className = "msg " + (error ? "err" : "ok"); m.textContent = error ? errText(error) : "Details saved."; if (!error) { const { data } = await sb.auth.getUser(); user = data.user; paintAccount(); } });
  const pw = V.querySelector("#pwForm");
  if (pw) pw.addEventListener("submit", async e => { e.preventDefault(); const m = pw.querySelector(".msg"); if (pw.password.value.length < 6) { m.className = "msg err"; m.textContent = "The password needs at least 6 characters."; return; } const { error } = await sb.auth.updateUser({ password: pw.password.value }); m.className = "msg " + (error ? "err" : "ok"); m.textContent = error ? errText(error) : "Password changed."; if (!error) pw.reset(); });
}

/* ---------- complaints ---------- */
async function viewNewComplaint(){
  loading();
  const { data: orders, error } = await sb.from("shop_orders").select("order_ref,created_at,items,status").order("created_at", { ascending: false });
  if (error) throw error;
  const pre = qs().get("order") || "";
  document.title = "Raise a complaint | Stream Zone";
  V.innerHTML = crumbs(`<a href="#/account">My account</a>`, `<a href="#/account/complaints">Complaints</a>`, "New") + `
  <div class="panel" style="max-width:720px"><h2>Raise a complaint</h2><p class="sub">Tell us what's wrong. We'll reply here and you'll see it under Complaints.</p>
  <form class="form" id="cForm" novalidate>
    <label>Order<select name="order"><option value="">Not about a specific order</option>${orders.map(o => `<option value="${esc(o.order_ref)}" ${o.order_ref === pre ? "selected" : ""}>${esc(o.order_ref)} · ${esc(o.items.map(i => i.name).join(", "))} · ${esc(o.status)}</option>`).join("")}</select></label>
    <label>Problem type<select name="cat">${["Account not working", "Wrong login details", "Payment issue", "Replacement request", "Refund request", "Other"].map(c => `<option>${c}</option>`).join("")}</select></label>
    <label>Subject<input name="subject" maxlength="150" required placeholder="For example, Netflix says the password is wrong"></label>
    <label>Describe the problem<textarea name="body" maxlength="3000" required placeholder="What happened, when it started, and what you've already tried"></textarea></label>
    <label>Screenshot (optional)<input type="file" name="file" accept="image/*,application/pdf"><small>JPG, PNG or PDF, up to 5 MB</small></label>
    <p class="msg" role="alert"></p>
    <div class="acts"><button class="btn" type="submit">Submit complaint</button><a class="btn outline" href="#/account/complaints">Cancel</a></div>
  </form></div>`;
  const f = V.querySelector("#cForm"), m = f.querySelector(".msg"), btn = f.querySelector("button[type=submit]");
  f.addEventListener("submit", async e => {
    e.preventDefault(); m.className = "msg"; m.textContent = "";
    if (!f.subject.value.trim() || !f.body.value.trim()) { m.className = "msg err"; m.textContent = "Add a subject and describe the problem."; return; }
    const file = f.file.files[0];
    if (file && file.size > 5 * 1024 * 1024) { m.className = "msg err"; m.textContent = "That file is over 5 MB. Upload a smaller screenshot."; return; }
    btn.disabled = true; btn.innerHTML = `<span class="spin"></span>`;
    try {
      const { data: c, error: e1 } = await sb.from("complaints").insert({ order_ref: f.order.value || null, category: f.cat.value, subject: f.subject.value.trim() }).select("id,ticket_ref").single();
      if (e1) throw e1;
      let path = null;
      if (file) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
        path = `${user.id}/complaint-${c.ticket_ref}-${Date.now()}.${ext}`;
        const { error: eu } = await sb.storage.from("receipts").upload(path, file, { contentType: file.type || undefined });
        if (eu) path = null;
      }
      const { error: e2 } = await sb.from("complaint_messages").insert({ complaint_id: c.id, sender: "customer", body: f.body.value.trim(), attachment_path: path });
      if (e2) throw e2;
      toast("Complaint submitted"); go("#/complaints/" + c.ticket_ref);
    } catch (err) { m.className = "msg err"; m.textContent = "We couldn't submit your complaint: " + errText(err); btn.disabled = false; btn.textContent = "Submit complaint"; }
  });
}
async function viewComplaint(ref){
  loading();
  const { data: c, error } = await sb.from("complaints").select("*").eq("ticket_ref", ref).maybeSingle();
  if (error) throw error;
  if (!c) { V.innerHTML = crumbs(`<a href="#/account/complaints">Complaints</a>`, "Not found") + `<div class="panel empty-box"><b>Complaint not found</b><a class="btn dark" href="#/account/complaints">My complaints</a></div>`; return; }
  const { data: msgs, error: e2 } = await sb.from("complaint_messages").select("*").eq("complaint_id", c.id).order("created_at");
  if (e2) throw e2;
  document.title = `Complaint ${c.ticket_ref} | Stream Zone`;
  V.innerHTML = crumbs(`<a href="#/account">My account</a>`, `<a href="#/account/complaints">Complaints</a>`, esc(c.ticket_ref)) + `
  <div class="panel" style="max-width:820px">
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><div><h2>${esc(c.subject)}</h2>
    <p class="sub" style="margin:0">${esc(c.ticket_ref)} · ${esc(c.category)}${c.order_ref ? ` · Order <a href="#/orders/${encodeURIComponent(c.order_ref)}">${esc(c.order_ref)}</a>` : ""}</p></div>${pill(c.status)}</div>
    <div class="thread" style="margin-top:18px">${msgs.map(x => `<div class="bubble ${x.sender === "customer" ? "me" : "them"}">${esc(x.body)}${x.attachment_path ? `<br><a href="#" data-att="${esc(x.attachment_path)}">View attachment</a>` : ""}<small>${x.sender === "customer" ? "You" : "Stream Zone support"} · ${fmtDate(x.created_at)}</small></div>`).join("")}</div>
    ${["Resolved", "Closed"].includes(c.status) ? `<p class="msg ok">This complaint is marked ${esc(c.status.toLowerCase())}. Reply below if the problem is back.</p>` : `<p class="msg info">We usually reply within a few hours. For urgent issues, <a href="${waLink("Assalam o Alaikum, about complaint " + c.ticket_ref + ".")}" target="_blank" rel="noopener">message us on WhatsApp</a>.</p>`}
    <form class="form" id="rForm" style="margin-top:16px" novalidate><label>Your reply<textarea name="body" maxlength="3000" required></textarea></label><div><button class="btn dark" type="submit">Send reply</button></div><p class="msg" role="alert"></p></form>
  </div>`;
  V.querySelectorAll("[data-att]").forEach(a => a.addEventListener("click", async e => { e.preventDefault(); const { data, error } = await sb.storage.from("receipts").createSignedUrl(a.dataset.att, 300); if (error) return toast(errText(error)); window.open(data.signedUrl, "_blank", "noopener"); }));
  const f = V.querySelector("#rForm");
  f.addEventListener("submit", async e => {
    e.preventDefault(); const m = f.querySelector(".msg");
    if (!f.body.value.trim()) { m.className = "msg err"; m.textContent = "Write your reply first."; return; }
    const { error } = await sb.from("complaint_messages").insert({ complaint_id: c.id, sender: "customer", body: f.body.value.trim() });
    if (error) { m.className = "msg err"; m.textContent = errText(error); return; }
    viewComplaint(ref);
  });
}

initAuth();
})();
