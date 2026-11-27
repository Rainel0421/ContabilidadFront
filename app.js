"use strict";
const KEY = "yavoy-business-v1";
const seed = [
  ["CREMA", 220],
  ["ENZIMA", 191],
  ["Memoria", 200],
  ["CAFE", 460],
  ["ANTENA", 480],
  ["TESTOSTERONA", 300],
  ["MUCLESTEST", 314],
  ["VT PDRN", 410],
  ["lLIP", 190],
  ["VITAMINA", 355],
];
const id = () =>
  globalThis.crypto?.randomUUID?.() ||
  Date.now().toString(36) + Math.random().toString(36).slice(2);
const today = () => {
  let p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Santo_Domingo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
};
const fresh = () => ({
  version: 1,
  products: seed.map(([name, cost], i) => ({
    id: "p" + i,
    name,
    sku: "YV-" + String(i + 1).padStart(3, "0"),
    cost,
    price: 0,
    min: 10,
    stock: null,
  })),
  moves: [],
  finance: [],
});
let db, revision, csrf, role, user;
function request(method, path, payload) {
  let r = new XMLHttpRequest();
  r.open(method, path, false);
  r.setRequestHeader("Accept", "application/json");
  if (method !== "GET") {
    r.setRequestHeader("Content-Type", "application/json");
    r.setRequestHeader("X-CSRF-Token", csrf || "");
  }
  r.send(payload === undefined ? null : JSON.stringify(payload));
  if (r.status === 401) {
    location.replace("/login");
    throw Error("Sesión vencida");
  }
  let result = JSON.parse(r.responseText);
  if (r.status < 200 || r.status >= 300)
    throw Error(result.error || "No se pudo completar la solicitud.");
  return result;
}
function load() {
  let r = request("GET", "/api/state");
  db = r.data;
  revision = r.revision;
  csrf = r.csrf;
  role = r.role;
  user = r.user;
  document.getElementById("account").textContent =
    user + " · " + (role === "admin" ? "Administrador" : "Contabilidad");
}
try {
  load();
} catch (e) {
  document.getElementById("view").textContent = e.message;
  throw e;
}
function refreshData() {
  try {
    load();
    render();
    notify("Datos actualizados.");
  } catch (e) {
    notify(e.message);
  }
}
function logout() {
  try {
    request("POST", "/api/logout");
    location.replace("/login");
  } catch (e) {
    notify(e.message);
  }
}
let page = "dashboard";
let period = today().slice(0, 7);
const $ = (x) => document.getElementById(x);
const adminDisabled = () => (role === "admin" ? "" : " disabled");
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
const money = (x) =>
  "RD$ " +
  Number(x).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const fmt = (x) => Number(x).toLocaleString("en-US");
const round = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const sum = (a, f) => round(a.reduce((s, x) => s + f(x), 0));
const byId = (x) => db.products.find((p) => p.id === x);
const month = (x) => x.date.slice(0, 7) === period;
const activeMoves = () => db.moves.filter((x) => !x.void);
const stock = (p) =>
  p.stock === null
    ? null
    : p.stock +
      activeMoves()
        .filter((x) => x.product === p.id)
        .reduce((s, x) => s + x.delta, 0);
const names = {
  dashboard: "Resumen general",
  products: "Productos e inventario",
  moves: "Entregas y movimientos",
  finance: "Contabilidad",
  reports: "Reportes",
  settings: "Respaldo y configuración",
};
const kinds = {
  delivery: "Entrega directa",
  entry: "Entrada de mercancía",
  dispatch: "Despacho",
  received: "Entrega de despacho",
  return: "Devolución recibida",
  loss: "Producto perdido · almacén",
  damage: "Producto dañado · almacén",
  loss_transit: "Producto perdido · tránsito",
  damage_transit: "Producto dañado · tránsito",
};
const types = {
  deposit: "Depósito COD",
  ads: "Publicidad",
  operating: "Gasto operativo",
  shipping: "Envíos / logística",
  other: "Otros gastos",
};
const transit = (p) =>
  activeMoves()
    .filter((x) => x.product === p.id)
    .reduce(
      (s, x) =>
        s +
        (x.kind === "dispatch"
          ? x.qty
          : [
                "received",
                "return",
                "loss_transit",
                "damage_transit",
              ].includes(x.kind)
            ? -x.qty
            : 0),
      0,
    );
const totals = () => {
  let m = activeMoves().filter(month),
    f = db.finance.filter((x) => !x.void && month(x));
  let sales = m.filter((x) => ["delivery", "received"].includes(x.kind));
  let damaged = m.filter((x) =>
      ["damage", "damage_transit"].includes(x.kind),
    ),
    lost = m.filter((x) => ["loss", "loss_transit"].includes(x.kind)),
    damagedUnits = sum(damaged, (x) => x.qty),
    lostUnits = sum(lost, (x) => x.qty),
    damageCost = sum(damaged, (x) => x.qty * x.cost),
    lossCost = sum(lost, (x) => x.qty * x.cost);
  let deposits = sum(
      f.filter((x) => x.type === "deposit"),
      (x) => x.dop,
    ),
    cogs = sum(sales, (x) => x.qty * x.cost),
    ads = sum(
      f.filter((x) => x.type === "ads"),
      (x) => x.dop,
    ),
    expenses = sum(
      f.filter((x) => !["deposit", "ads"].includes(x.type)),
      (x) => x.dop,
    ),
    revenue = sum(sales, (x) => x.qty * x.price);
  return {
    deposits,
    cogs,
    ads,
    expenses,
    revenue,
    damagedUnits,
    lostUnits,
    damageCost,
    lossCost,
    profit: round(
      deposits - cogs - ads - expenses - damageCost - lossCost,
    ),
    units: sum(sales, (x) => x.qty),
    sales,
    m,
    f,
  };
};
function notify(s) {
  const toast = $("toast");
  toast.textContent = s;
  toast.classList.add("visible");
  clearTimeout(notify.t);
  notify.t = setTimeout(() => toast.classList.remove("visible"), 4000);
}
function commit(next) {
  try {
    let r = request("PUT", "/api/state", { revision, data: next });
    revision = r.revision;
    db = next;
    render();
    return true;
  } catch (e) {
    alert(
      e.message ||
        "No se confirmó el guardado. Actualiza antes de reintentar.",
    );
    return false;
  }
}
function mutate(fn) {
  let next = JSON.parse(JSON.stringify(db));
  fn(next);
  return commit(next);
}
function go(p) {
  page = p;
  render();
}
function card(label, value, sub = "") {
  return `<div class="card"><span class="muted">${label}</span><strong>${value}</strong><small class="muted">${sub}</small></div>`;
}
function table(headers, rows) {
  return `<div class="tablewrap"><table><thead><tr>${headers.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${headers.length}" class="empty">Sin registros</td></tr>`}</tbody></table></div>`;
}
const tr = (...x) =>
  "<tr>" + x.map((y) => `<td>${y}</td>`).join("") + "</tr>";
const pill = (s, c = "") => `<span class="pill ${c}">${s}</span>`;
function state(p) {
  let s = stock(p);
  return s === null
    ? pill("Sin configurar", "warn")
    : s === 0
      ? pill("Agotado", "bad")
      : s <= p.min
        ? pill("Bajo", "warn")
        : pill("Disponible");
}
function opt(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`)
    .join("");
}
function productsOpts() {
  return db.products
    .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
    .join("");
}
function field(label, name, type = "text", value = "", extra = "") {
  return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}
function dashboard() {
  let t = totals(),
    low = db.products.filter(
      (p) => stock(p) !== null && stock(p) <= p.min,
    ),
    unknown = db.products.filter((p) => p.stock === null);
  return `<p class="muted">Indicadores del período seleccionado. Las existencias muestran el saldo actual.</p><div class="cards">${card("Depósitos recibidos", money(t.deposits), "Cobros registrados")}${card("Utilidad del período", `<span class="${t.profit >= 0 ? "positive" : "negative"}">${money(t.profit)}</span>`, "Depósitos menos costos y gastos")}${card("Unidades entregadas", fmt(t.units))}${card("Inventario disponible", fmt(sum(db.products, (p) => stock(p) ?? 0)), `${unknown.length} productos sin configurar`)}${card("Inventario bajo", low.length + " productos")}${card("En tránsito", fmt(sum(db.products, transit)))}${card("Productos dañados", fmt(t.damagedUnits), money(t.damageCost) + " en costo")}${card("Productos perdidos", fmt(t.lostUnits), money(t.lossCost) + " en costo")}</div>${unknown.length ? `<div class="notice">Configura el inventario inicial de ${unknown.length} productos antes de registrar sus movimientos. <button class="secondary" data-action="navigate" data-value="products">Configurar</button></div>` : ""}<div class="panel"><h2>Alertas de inventario</h2>${table(
    ["Producto", "Disponibles", "Mínimo", "Estado"],
    low.map((p) => tr(esc(p.name), stock(p), p.min, state(p))),
  )}</div><div class="panel"><h2>Estado de resultados</h2>${financialSummary(t)}</div><div class="panel"><h2>Entregas por producto</h2>${productResults(t)}</div>`;
}
function financialSummary(t) {
  return table(
    ["Concepto", "Importe"],
    [
      ["Depósitos COD", t.deposits],
      ["Costo de unidades entregadas", -t.cogs],
      ["Productos dañados", -t.damageCost],
      ["Productos perdidos", -t.lossCost],
      ["Publicidad", -t.ads],
      ["Gastos operativos y otros", -t.expenses],
      ["Utilidad", t.profit],
    ]
      .map(([k, v]) =>
        tr(
          k,
          `<strong class="${v < 0 ? "negative" : ""}">${money(v)}</strong>`,
        ),
      )
      .concat(
        tr(
          "Margen sobre depósitos",
          t.deposits
            ? ((100 * t.profit) / t.deposits).toFixed(2) + "%"
            : "—",
        ),
        tr(
          "Costo publicidad por unidad entregada",
          t.units ? money(t.ads / t.units) : "—",
        ),
        tr(
          "Valor estimado de entregas (no es depósito)",
          money(t.revenue),
        ),
      ),
  );
}
function productResults(t) {
  return table(
    [
      "Producto",
      "Unidades",
      "Valor de entregas",
      "Costo mercancía",
      "Margen bruto estimado",
      "Dañados",
      "Perdidos",
      "Costo de pérdidas",
    ],
    db.products.map((p) => {
      let a = t.sales.filter((x) => x.product === p.id),
        q = sum(a, (x) => x.qty),
        v = sum(a, (x) => x.qty * x.price),
        c = sum(a, (x) => x.qty * x.cost);
      let damaged = t.m.filter(
          (x) =>
            x.product === p.id &&
            ["damage", "damage_transit"].includes(x.kind),
        ),
        lost = t.m.filter(
          (x) =>
            x.product === p.id &&
            ["loss", "loss_transit"].includes(x.kind),
        );
      return tr(
        esc(p.name),
        q,
        money(v),
        money(c),
        money(v - c),
        sum(damaged, (x) => x.qty),
        sum(lost, (x) => x.qty),
        money(sum([...damaged, ...lost], (x) => x.qty * x.cost)),
      );
    }),
  );
}
function products() {
  return `<div class="toolbar"><button data-action="edit-product"${adminDisabled()}>+ Nuevo producto</button><input id="search" placeholder="Buscar producto o SKU"></div><div class="panel"><h2>Catálogo e inventario</h2><div id="productTable">${productTable("")}</div></div><p class="muted">El costo y precio se guardan en cada entrega para que los cambios futuros no alteren los resultados históricos.</p>`;
}
function productTable(q) {
  return table(
    [
      "Producto / SKU",
      "Costo",
      "Precio",
      "Disponible",
      "En tránsito",
      "Mínimo",
      "Estado",
      "Acción",
    ],
    db.products
      .filter((p) =>
        (p.name + " " + p.sku).toLowerCase().includes(q.toLowerCase()),
      )
      .map((p) =>
        tr(
          `<strong>${esc(p.name)}</strong><br><small class="muted">${esc(p.sku)}</small>`,
          money(p.cost),
          money(p.price),
          stock(p) ?? "—",
          transit(p),
          p.min,
          state(p),
          `<button class="secondary" data-action="edit-product" data-value="${esc(p.id)}"${adminDisabled()}>Editar</button>`,
        ),
      ),
  );
}
function filterProducts(q) {
  $("productTable").innerHTML = productTable(q);
}
function editProduct(pid) {
  if (role !== "admin") return notify("Solo administrador.");
  let p = pid
    ? byId(pid)
    : { name: "", sku: "", cost: 0, price: 0, min: 10, stock: null };
  $("modal").innerHTML =
    `<h2>${pid ? "Editar" : "Nuevo"} producto</h2><form id="productForm"><div class="grid">${field("Nombre", "name", "text", p.name, 'required maxlength="100"')}${field("SKU", "sku", "text", p.sku, 'required maxlength="60"')}${field("Costo unitario RD$", "cost", "number", p.cost, 'required min="0" step="0.01"')}${field("Precio de venta RD$", "price", "number", p.price, 'required min="0" step="0.01"')}${field("Mínimo de inventario", "min", "number", p.min, 'required min="0" step="1"')}${field("Inventario inicial", "stock", "number", p.stock ?? "", p.stock === null ? 'required min="0" step="1"' : "disabled")}</div><p class="muted">Una vez configurado el inventario inicial, usa movimientos para modificar existencias.</p><div class="toolbar"><button>Guardar producto</button><button type="button" class="secondary" data-action="close-modal">Cancelar</button></div></form>`;
  $("modal").showModal();
  $("productForm").onsubmit = (e) => {
    e.preventDefault();
    let f = new FormData(e.target),
      name = f.get("name").trim(),
      sku = f.get("sku").trim();
    if (
      !name ||
      !sku ||
      db.products.some(
        (x) => x.id !== pid && x.sku.toLowerCase() === sku.toLowerCase(),
      )
    )
      return notify("Nombre y SKU único son obligatorios.");
    let x = {
      id: pid || id(),
      name,
      sku,
      cost: +f.get("cost"),
      price: +f.get("price"),
      min: +f.get("min"),
      stock: p.stock === null ? +f.get("stock") : p.stock,
    };
    if (
      mutate((d) => {
        if (pid)
          d.products[d.products.findIndex((y) => y.id === pid)] = x;
        else d.products.push(x);
      })
    ) {
      $("modal").close();
      notify("Producto guardado");
    }
  };
}
function moves() {
  return `<div class="panel"><h2>Registrar movimiento</h2><div class="toolbar"><button class="secondary" data-action="choose-loss" data-value="damage">+ Producto dañado</button><button class="secondary" data-action="choose-loss" data-value="loss">+ Producto perdido</button></div><form id="moveForm"><div class="grid"><label>Producto<select name="product" required>${productsOpts()}</select></label><label>Movimiento<select name="kind">${opt(kinds)}</select></label>${field("Cantidad", "qty", "number", 1, 'min="1" step="1" required')}${field("Fecha", "date", "date", today(), "required")}${field("Referencia / nota", "note", "text", "", 'maxlength="180"')}<button>Registrar</button></div><p class="muted" id="moveHint"></p></form></div><div class="panel"><h2>Historial de movimientos · ${esc(period)}</h2>${table(
    [
      "Fecha",
      "Producto",
      "Movimiento",
      "Cantidad",
      "Cambio almacén",
      "Referencia",
      "Estado",
    ],
    db.moves
      .filter(month)
      .slice()
      .reverse()
      .map((x) =>
        tr(
          esc(x.date),
          esc(byId(x.product)?.name),
          kinds[x.kind],
          x.qty,
          (x.delta > 0 ? "+" : "") + x.delta,
          esc(x.note),
          x.void
            ? pill("Anulado", "bad")
            : `<button class="danger" data-action="void-move" data-value="${esc(x.id)}"${adminDisabled()}>Anular</button>`,
        ),
      ),
  )}</div>`;
}
function chooseLoss(k) {
  let f = $("moveForm");
  f.kind.value = k;
  moveHint();
  f.qty.focus();
}
function moveHint() {
  let f = $("moveForm"),
    p = byId(f.product.value),
    k = f.kind.value;
  $("moveHint").textContent = p
    ? `Disponible: ${stock(p) ?? "sin configurar"} · En tránsito: ${transit(p)}. ${k === "received" ? "Confirma una entrega previamente despachada: no descuenta dos veces." : k === "return" ? "Devuelve unidades en tránsito al almacén, tras recibirlas físicamente." : k === "delivery" ? "Descuenta unidades directamente del almacén." : ["loss_transit", "damage_transit"].includes(k) ? "Descuenta unidades en tránsito y registra su costo como pérdida. No genera venta." : ["loss", "damage"].includes(k) ? "Descuenta unidades del almacén y registra su costo como pérdida. No genera venta." : ""}`
    : "";
}
function addMove(e) {
  e.preventDefault();
  let f = new FormData(e.target),
    p = byId(f.get("product")),
    kind = f.get("kind"),
    qty = +f.get("qty"),
    date = f.get("date"),
    note = f.get("note").trim();
  if (
    !p ||
    p.stock === null ||
    !Number.isSafeInteger(qty) ||
    qty < 1 ||
    !kinds[kind]
  )
    return notify(
      "Configura el inventario e indica una cantidad válida.",
    );
  let delta = ["entry", "return"].includes(kind)
    ? qty
    : ["received", "loss_transit", "damage_transit"].includes(kind)
      ? 0
      : -qty;
  if (stock(p) + delta < 0) return notify("Inventario insuficiente.");
  if (
    ["received", "return", "loss_transit", "damage_transit"].includes(
      kind,
    ) &&
    transit(p) < qty
  )
    return notify("No hay suficientes unidades en tránsito.");
  if (
    note &&
    activeMoves().some(
      (x) => x.product === p.id && x.kind === kind && x.note === note,
    )
  )
    return notify("Ya existe un movimiento con esta referencia.");
  let x = {
    id: id(),
    product: p.id,
    kind,
    qty,
    delta,
    date,
    note,
    cost: p.cost,
    price: p.price,
    void: false,
  };
  if (mutate((d) => d.moves.push(x)))
    notify("Movimiento registrado correctamente.");
}
function voidMove(mid) {
  if (role !== "admin") return notify("Solo administrador.");
  let x = db.moves.find((x) => x.id === mid),
    p = byId(x.product);
  if (!x || x.void) return;
  let change =
    x.kind === "dispatch"
      ? x.qty
      : ["received", "return", "loss_transit", "damage_transit"].includes(
            x.kind,
          )
        ? -x.qty
        : 0;
  if (stock(p) - x.delta < 0 || transit(p) - change < 0)
    return notify("No se puede anular: hay movimientos dependientes.");
  if (confirm("¿Anular el movimiento y revertir sus efectos?"))
    if (mutate((d) => (d.moves.find((y) => y.id === mid).void = true)))
      notify("Movimiento anulado.");
}
function finance() {
  let t = totals();
  return `<div class="panel"><h2>Registrar ingreso o gasto</h2><form id="financeForm"><div class="grid"><label>Concepto<select name="type">${opt(types)}</select></label>${field("Fecha", "date", "date", today(), "required")}${field("Importe", "amount", "number", "", 'required min="0.01" step="0.01"')}<label>Moneda<select name="currency"><option>DOP</option><option>USD</option></select></label>${field("Tasa RD$ / USD", "rate", "number", 60, 'required min="0.01" step="0.01"')}${field("Detalle / referencia", "note", "text", "", 'maxlength="180"')}<button>Guardar registro</button></div><p class="muted">La tasa se utiliza únicamente para USD. Registra depósitos netos o brutos de forma consistente; no dupliques comisiones ya deducidas.</p></form></div><div class="panel"><h2>Estado de resultados · ${esc(period)}</h2>${financialSummary(t)}</div><div class="panel"><h2>Movimientos financieros</h2>${table(
    [
      "Fecha",
      "Concepto",
      "Detalle",
      "Importe original",
      "Equivalente RD$",
      "Acción",
    ],
    db.finance
      .filter(month)
      .slice()
      .reverse()
      .map((x) =>
        tr(
          esc(x.date),
          types[x.type],
          esc(x.note),
          esc(x.currency) + " " + fmt(x.amount),
          money(x.dop),
          x.void
            ? pill("Anulado", "bad")
            : `<button class="danger" data-action="void-finance" data-value="${esc(x.id)}"${adminDisabled()}>Anular</button>`,
        ),
      ),
  )}</div>`;
}
function addFinance(e) {
  e.preventDefault();
  let f = new FormData(e.target),
    type = f.get("type"),
    amount = +f.get("amount"),
    currency = f.get("currency"),
    rate = currency === "DOP" ? 1 : +f.get("rate"),
    note = f.get("note").trim(),
    date = f.get("date");
  if (
    !types[type] ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isFinite(rate) ||
    rate <= 0
  )
    return notify("Importe o tasa inválida.");
  if (
    note &&
    db.finance.some((x) => !x.void && x.type === type && x.note === note)
  )
    return notify("Referencia ya registrada para ese concepto.");
  if (
    mutate((d) =>
      d.finance.push({
        id: id(),
        type,
        amount,
        currency,
        rate,
        dop: round(amount * rate),
        note,
        date,
        void: false,
      }),
    )
  )
    notify("Registro financiero guardado.");
}
function voidFinance(fid) {
  if (role !== "admin") return notify("Solo administrador.");
  if (confirm("¿Anular este registro financiero?"))
    if (mutate((d) => (d.finance.find((x) => x.id === fid).void = true)))
      notify("Registro anulado.");
}
function download(name, content, mime) {
  let a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function csv(rows) {
  return (
    "\ufeff" +
    rows
      .map((r) =>
        r
          .map(
            (v) =>
              '"' +
              String(v ?? "")
                .replace(/^[=+@\-](?=\D)/, "'$&")
                .replace(/"/g, '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n")
  );
}
function exportCsv(type) {
  let t = totals(),
    rows =
      type === "inventory"
        ? [
            [
              "SKU",
              "Producto",
              "Costo DOP",
              "Precio DOP",
              "Disponible",
              "En tránsito",
              "Mínimo",
            ],
            ...db.products.map((p) => [
              p.sku,
              p.name,
              p.cost,
              p.price,
              stock(p),
              transit(p),
              p.min,
            ]),
          ]
        : type === "moves"
          ? [
              [
                "Fecha",
                "Producto",
                "Tipo",
                "Cantidad",
                "Cambio",
                "Costo unitario",
                "Precio unitario",
                "Nota",
                "Anulado",
              ],
              ...db.moves
                .filter(month)
                .map((x) => [
                  x.date,
                  byId(x.product)?.name,
                  kinds[x.kind],
                  x.qty,
                  x.delta,
                  x.cost,
                  x.price,
                  x.note,
                  x.void ? "Sí" : "No",
                ]),
            ]
          : [
              [
                "Fecha",
                "Tipo",
                "Moneda",
                "Importe",
                "Tasa",
                "DOP",
                "Nota",
                "Anulado",
              ],
              ...db.finance
                .filter(month)
                .map((x) => [
                  x.date,
                  types[x.type],
                  x.currency,
                  x.amount,
                  x.rate,
                  x.dop,
                  x.note,
                  x.void ? "Sí" : "No",
                ]),
            ];
  download(
    "YavoyStore-" + type + "-" + period + ".csv",
    csv(rows),
    "text/csv;charset=utf-8",
  );
}
function reports() {
  let t = totals();
  return `<div class="toolbar"><button data-action="export-csv" data-value="inventory">Exportar inventario CSV</button><button data-action="export-csv" data-value="moves">Exportar entregas CSV</button><button data-action="export-csv" data-value="finance">Exportar contabilidad CSV</button><button class="secondary" data-action="print">Imprimir / PDF</button></div><div class="panel"><h2>Estado de resultados · ${esc(period)}</h2>${financialSummary(t)}</div><div class="panel"><h2>Rentabilidad bruta por producto</h2>${productResults(t)}</div>`;
}
function backup() {
  download(
    "YavoyStore-respaldo-" + today() + ".json",
    JSON.stringify(db, null, 2),
    "application/json",
  );
}
function validate(d) {
  const num = (x) =>
    typeof x === "number" && Number.isFinite(x) && x >= 0;
  const text = (x) => typeof x === "string";
  const date = (x) => text(x) && /^\d{4}-\d{2}-\d{2}$/.test(x);
  if (
    !d ||
    d.version !== 1 ||
    !Array.isArray(d.products) ||
    !Array.isArray(d.moves) ||
    !Array.isArray(d.finance)
  )
    return false;
  let ids = new Set();
  for (let p of d.products) {
    if (
      !text(p.id) ||
      !/^[\w-]+$/.test(p.id) ||
      ids.has(p.id) ||
      !text(p.name) ||
      !text(p.sku) ||
      !num(p.cost) ||
      !num(p.price) ||
      !Number.isSafeInteger(p.min) ||
      p.min < 0 ||
      !(
        p.stock === null ||
        (Number.isSafeInteger(p.stock) && p.stock >= 0)
      )
    )
      return false;
    ids.add(p.id);
  }
  for (let m of d.moves) {
    if (
      !ids.has(m.product) ||
      !text(m.id) ||
      !/^[\w-]+$/.test(m.id) ||
      !Object.hasOwn(kinds, m.kind) ||
      !Number.isSafeInteger(m.qty) ||
      m.qty <= 0 ||
      m.delta !==
        (["entry", "return"].includes(m.kind)
          ? m.qty
          : ["received", "loss_transit", "damage_transit"].includes(
                m.kind,
              )
            ? 0
            : -m.qty) ||
      !num(m.cost) ||
      !num(m.price) ||
      !date(m.date) ||
      !text(m.note) ||
      typeof m.void !== "boolean"
    )
      return false;
  }
  for (let f of d.finance) {
    if (
      !text(f.id) ||
      !/^[\w-]+$/.test(f.id) ||
      !Object.hasOwn(types, f.type) ||
      !num(f.amount) ||
      !num(f.rate) ||
      !num(f.dop) ||
      !["DOP", "USD"].includes(f.currency) ||
      !date(f.date) ||
      !text(f.note) ||
      typeof f.void !== "boolean"
    )
      return false;
  }
  return true;
}
function audit() {
  try {
    let r = request("GET", "/api/audit");
    $("audit").innerHTML = table(
      ["Fecha UTC", "Usuario", "Acción", "Revisión"],
      r.events.map((x) => tr(...x.map(esc))),
    );
  } catch (e) {
    notify(e.message);
  }
}
function settings() {
  return `<div class="panel"><h2>Protección de tus datos</h2><p>Los datos se guardan en la base de datos del servidor. Actualiza para ver cambios de otros usuarios. Descarga respaldos periódicos y guárdalos en un lugar privado. Solo el administrador puede restaurar.</p><div class="toolbar"><button data-action="backup">Descargar respaldo JSON</button><button class="secondary" data-action="restore"${adminDisabled()}>Restaurar respaldo</button></div></div><div class="panel"><h2>Configuración inicial</h2><p>Catálogo precargado con los diez productos y costos unitarios de la hoja de noviembre. Los precios, existencias, entregas y movimientos financieros deben introducirse o migrarse. El umbral inicial es de 10 unidades y se puede editar por producto.</p><p>La aplicación no modifica Google Sheets ni se conecta a Whatalo o Meta Ads. El acceso de contabilidad puede registrar entregas, movimientos y gastos, pero no editar productos, anular registros o restaurar respaldos.</p></div>${role === "admin" ? `<div class="panel"><h2>Auditoría de cambios</h2><button class="secondary" data-action="audit">Ver últimas 200 revisiones</button><div id="audit"></div></div>` : ""}`;
}
$("restore").onchange = async (e) => {
  if (role !== "admin") {
    e.target.value = "";
    return notify("Solo administrador.");
  }
  let f = e.target.files[0];
  if (!f) return;
  try {
    let d = JSON.parse(await f.text());
    if (!validate(d)) throw Error();
    if (
      confirm(
        "Esto reemplazará todos los datos actuales. ¿Has guardado un respaldo?",
      )
    )
      if (commit(d)) notify("Respaldo restaurado.");
  } catch {
    notify("Archivo de respaldo inválido.");
  }
  e.target.value = "";
};
function render() {
  $("nav").innerHTML = Object.entries(names)
    .map(
      ([k, v]) =>
        `<button class="${page === k ? "active" : ""}" data-action="navigate" data-value="${esc(k)}">${v}</button>`,
    )
    .join("");
  $("title").textContent = names[page];
  $("crumb").textContent = names[page];
  $("period").value = period;
  $("view").innerHTML = {
    dashboard,
    products,
    moves,
    finance,
    reports,
    settings,
  }[page]();
  if (page === "moves") {
    $("moveForm").onsubmit = addMove;
    $("moveForm").onchange = moveHint;
    moveHint();
  }
  if (page === "products") {
    $("search").addEventListener("input", (e) => filterProducts(e.target.value));
  }
  if (page === "finance") $("financeForm").onsubmit = addFinance;
}
const actions = new Map([
  ["logout", logout],
  ["refresh", refreshData],
  ["backup", backup],
  ["navigate", go],
  ["edit-product", editProduct],
  ["close-modal", () => $("modal").close()],
  ["choose-loss", chooseLoss],
  ["void-move", voidMove],
  ["void-finance", voidFinance],
  ["export-csv", exportCsv],
  ["print", () => window.print()],
  ["restore", () => $("restore").click()],
  ["audit", audit],
]);
document.addEventListener("click", (e) => {
  const button = e.target.closest("button[data-action]");
  if (button && !button.disabled) {
    actions.get(button.dataset.action)?.(button.dataset.value);
  }
});
$("period").onchange = (e) => {
  if (e.target.value) {
    period = e.target.value;
    render();
  }
};
render();
