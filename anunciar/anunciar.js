// Compra de anuncios de Wayout. Habla con el Worker (anuncios/src/index.ts) en el mismo dominio;
// en local, con `wrangler dev` en el puerto 8799.
(() => {
  const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
  const API = LOCAL ? "http://127.0.0.1:8799" : "";
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fecha = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MESES[m - 1]} ${y}`; };
  const corta = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${d} ${MESES[m - 1]}`; };
  const usd = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ","));
  const LIMITES = { marca: 40, categoria: 20, titular: 50, frase: 120, boton: 18, en_titular: 50, en_frase: 120, en_boton: 18 };

  const form = $("#form");
  let cfg = null;
  let sel = null; // { tipo, dias }
  let objBanner = null;
  let objLogo = null;

  // ---------- Tablero de tarifas ----------

  function pintarTablero() {
    for (const b of $$(".fare")) {
      const tipo = b.dataset.tipo;
      const dias = Number(b.dataset.dias);
      if (!cfg) {
        b.innerHTML = `<span class="amt"><span class="skel"></span></span><span class="from"><span class="skel" style="width:12ch"></span></span>`;
        b.disabled = true;
        continue;
      }
      const precio = cfg.precios[tipo][dias];
      const desde = cfg.disponible[tipo][dias];
      const libre = desde === cfg.primerDia;
      b.disabled = false;
      b.setAttribute("aria-pressed", String(!!sel && sel.tipo === tipo && sel.dias === dias));
      b.setAttribute("aria-label", `${tipo === "destacado" ? "Destacado" : "Normal"}, ${dias} días, ${precio} dólares, empieza el ${fecha(desde)}`);
      b.innerHTML = `<span class="amt">${precio}<small>USD</small></span><i class="ph-light ph-arrow-right go" aria-hidden="true"></i>
        <span class="per">${usd(Math.round((precio / dias) * 100) / 100)} USD por día</span>
        <span class="from"><i class="ph-light ${libre ? "ph-calendar-check" : "ph-hourglass-medium"}" aria-hidden="true"></i>${libre ? "Sale desde mañana" : `Cupo libre desde el ${corta(desde)}`}</span>`;
    }
  }

  async function cargarConfig() {
    pintarTablero();
    try {
      const r = await fetch(`${API}/api/anuncios/config`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      cfg = await r.json();
      pintarTablero();
      const f = $("#f-fecha");
      f.min = cfg.primerDia;
      if (!f.value) f.value = cfg.primerDia;
      pintarPlan();
      if (!cfg.abierto) {
        // Sin credenciales de PayPal todavía: se ve todo, pero no se puede reservar.
        $("#enviar").disabled = true;
        $("#enviar").nextElementSibling.textContent = "Los pagos abren en unos días. Ya puedes ver precios y fechas y armar tu anuncio.";
        $("#board-note").textContent = `Los pagos abren en unos días; las fechas libres que ves ya son reales. ${$("#board-note").textContent}`;
      }
    } catch {
      $("#board-note").innerHTML = `No pudimos cargar los precios y las fechas. <button class="btn" type="button" id="reintentar" style="height:32px;margin-left:8px">Reintentar</button>`;
      $("#reintentar").addEventListener("click", () => location.reload());
    }
  }

  $(".board").addEventListener("click", (e) => {
    const b = e.target.closest(".fare");
    if (!b || b.disabled) return;
    sel = { tipo: b.dataset.tipo, dias: Number(b.dataset.dias) };
    pintarTablero();
    pintarPlan();
    ocultarResumen();
    $("#pedido").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });

  function pintarPlan() {
    const box = $("#plan-sum");
    if (!sel || !cfg) {
      box.innerHTML = `<span>Elige un plan en el <a href="#planes">tablero de tarifas</a>.</span>`;
      $("#f-tipo").value = "";
      $("#f-dias").value = "";
      return;
    }
    $("#f-tipo").value = sel.tipo;
    $("#f-dias").value = String(sel.dias);
    const precio = cfg.precios[sel.tipo][sel.dias];
    const desde = cfg.disponible[sel.tipo][sel.dias];
    box.innerHTML = `<span class="picto" aria-hidden="true"><i class="ph-light ${sel.tipo === "destacado" ? "ph-star" : "ph-rows"}"></i></span>
      <b>${sel.tipo === "destacado" ? "Destacado" : "Normal"}, ${sel.dias} días, ${precio} USD</b>
      <a class="chg" href="#planes">Cambiar</a>`;
    const f = $("#f-fecha");
    if (f.value < desde) f.value = desde;
    $("#fecha-hint").textContent = desde === cfg.primerDia
      ? "Lo más pronto es mañana, para revisar tu anuncio. Si eliges un día sin cupo, te damos el siguiente libre antes de pagar."
      : `Con este plan el primer cupo libre es el ${fecha(desde)}. Si eliges otro día sin cupo, te damos el siguiente libre antes de pagar.`;
    pintarVista();
  }

  // ---------- Vista previa y contadores ----------

  function valor(nombre) {
    return (form.elements[nombre]?.value ?? "").replace(/\s+/g, " ").trim();
  }

  function pintarContadores() {
    for (const el of $$("[data-count]")) {
      const k = el.dataset.count;
      const n = valor(k).length;
      el.textContent = `${n}/${LIMITES[k]}`;
      el.classList.toggle("over", n > LIMITES[k]);
    }
  }

  function pintarVista() {
    const titular = valor("titular") || "Tu titular";
    const frase = valor("frase") || "La frase que explica qué gana quien hace clic.";
    const boton = valor("boton") || "Tu botón";
    const usaImagen = form.elements.banner.value === "imagen";
    $("#drop-banner").hidden = !usaImagen;
    $("#pv-ban").innerHTML = usaImagen && objBanner
      ? `<img src="${objBanner}" alt="">`
      : usaImagen
        ? `<div class="house" style="background:var(--ivory-2);color:var(--ink-2);align-items:center;justify-content:center;text-align:center"><i class="ph-light ph-image-square" style="color:var(--ink-2);margin:0;font-size:32px" aria-hidden="true"></i><span style="color:var(--ink-2)">Aquí va tu banner de 300 × 600</span></div>`
        : `<div class="house"><i class="ph-light ph-megaphone" aria-hidden="true"></i><b>${esc(titular)}</b><span>${esc(frase)}</span><span class="cta"><i class="ph-light ph-envelope-simple" aria-hidden="true"></i>${esc(boton)}</span></div>`;
    const dest = sel?.tipo === "destacado";
    const spot = $("#pv-spot");
    spot.classList.toggle("lead", dest);
    spot.innerHTML = `${objLogo ? `<img src="${objLogo}" alt="">` : `<span class="picto" aria-hidden="true"><i class="ph-light ${dest ? "ph-megaphone" : "ph-storefront"}"></i></span>`}
      <span><span class="kicker">${esc(valor("categoria") || "Categoría")}</span><b>${esc(titular)}</b><span class="text">${esc(frase)}</span></span>
      <span class="cta">${esc(boton)}</span>`;
    $("#pv-meta").textContent = dest
      ? "Destacado: tu banner abre el carrusel y se queda 15 segundos; tu fila va primera y resaltada."
      : "Normal: tu banner se ve 8 segundos en cada vuelta del carrusel; tu fila va después del destacado.";
  }

  form.addEventListener("input", (e) => {
    if (e.target.name) limpiarError(e.target.name);
    pintarContadores();
    pintarVista();
    if (e.target.type !== "file") ocultarResumen();
  });

  // ---------- Archivos: se revisan aquí también para avisar antes de enviar ----------

  function medir(file) {
    return new Promise((res) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => res({ url, w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => { URL.revokeObjectURL(url); res(null); };
      img.src = url;
    });
  }

  $("#f-imagen").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (objBanner) URL.revokeObjectURL(objBanner);
    objBanner = null;
    if (f) {
      const m = await medir(f);
      if (!m) mostrarError("imagen", "No pudimos leer esa imagen. Usa PNG, JPG, GIF o WebP.");
      else if (f.size > 400 * 1024) { URL.revokeObjectURL(m.url); mostrarError("imagen", `Pesa ${Math.round(f.size / 1024)} kB; el máximo es 400 kB.`); }
      else if (!((m.w === 300 && m.h === 600) || (m.w === 600 && m.h === 1200))) { URL.revokeObjectURL(m.url); mostrarError("imagen", `Mide ${m.w} × ${m.h}; tiene que medir 300 × 600 (o 600 × 1200).`); }
      else objBanner = m.url;
      if (!objBanner) e.target.value = "";
    }
    pintarVista();
  });

  $("#f-logo").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (objLogo) URL.revokeObjectURL(objLogo);
    objLogo = null;
    if (f) {
      const m = await medir(f);
      if (!m) mostrarError("logo", "No pudimos leer esa imagen. Usa PNG, JPG, GIF o WebP.");
      else if (f.size > 100 * 1024) { URL.revokeObjectURL(m.url); mostrarError("logo", `Pesa ${Math.round(f.size / 1024)} kB; el máximo es 100 kB.`); }
      else if (m.w !== m.h || m.w < 56 || m.w > 512) { URL.revokeObjectURL(m.url); mostrarError("logo", `Mide ${m.w} × ${m.h}; tiene que ser cuadrado, de 56 a 512 px.`); }
      else objLogo = m.url;
      if (!objLogo) e.target.value = "";
    }
    pintarVista();
  });

  // ---------- Errores ----------

  function mostrarError(campo, msg) {
    const el = $(`[data-err="${campo}"]`);
    if (el) el.textContent = msg;
    const input = form.elements[campo];
    if (input && input.setAttribute) input.setAttribute("aria-invalid", "true");
  }

  function limpiarError(campo) {
    const el = $(`[data-err="${campo}"]`);
    if (el) el.textContent = "";
    const input = form.elements[campo];
    if (input && input.removeAttribute) input.removeAttribute("aria-invalid");
  }

  function limpiarErrores() {
    for (const el of $$("[data-err]")) el.textContent = "";
    for (const el of $$("[aria-invalid]", form)) el.removeAttribute("aria-invalid");
    $("#form-err").textContent = "";
  }

  // ---------- Envío, resumen y pago ----------

  function ocultarResumen() {
    const r = $("#resumen");
    if (!r.hidden && !r.dataset.pagado) { r.hidden = true; r.innerHTML = ""; }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    limpiarErrores();
    if (!sel) {
      $("#form-err").textContent = "Elige primero un plan en el tablero de tarifas.";
      $("#planes").scrollIntoView();
      return;
    }
    if (form.elements.banner.value === "imagen" && !objBanner) {
      mostrarError("imagen", "Sube tu banner de 300 × 600 o elige la plantilla de Wayout.");
      $("#f-imagen").focus();
      return;
    }
    const btn = $("#enviar");
    btn.disabled = true;
    btn.innerHTML = `<i class="ph-light ph-circle-notch" aria-hidden="true"></i>Buscando tu fecha…`;
    try {
      const r = await fetch(`${API}/api/anuncios/pedidos`, { method: "POST", body: new FormData(form) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        for (const [k, v] of Object.entries(j.errores || {})) mostrarError(k, v);
        $("#form-err").textContent = j.error || "No pudimos registrar el pedido. Vuelve a intentarlo.";
        const primero = $("[aria-invalid=true]", form);
        if (primero) primero.focus();
        return;
      }
      mostrarResumen(j);
    } catch {
      $("#form-err").textContent = "Sin conexión con el servidor. Revisa tu internet y vuelve a intentarlo.";
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="ph-light ph-calendar-check" aria-hidden="true"></i>Ver fechas y pagar`;
    }
  });

  function mostrarResumen(p) {
    const r = $("#resumen");
    const hasta = new Date(p.reservaHasta).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
    r.hidden = false;
    delete r.dataset.pagado;
    r.innerHTML = `<h3>${p.movido ? "Ese día ya no había cupo. " : ""}Tu anuncio sale el ${fecha(p.inicio)}.</h3>
      <div class="dates"><span>Empieza</span><span>Último día</span><span>Total</span>
        <b>${corta(p.inicio)}</b><b>${corta(p.ultimoDia)}</b><b>${p.precio} USD</b></div>
      <p>Te guardamos este cupo hasta las ${hasta}. Al pagar, revisamos tu anuncio antes de esa fecha; si no cumple las reglas, te devolvemos todo.</p>
      <div class="pay" id="pay"><p style="color:var(--ink-2)">Cargando PayPal…</p></div>`;
    r.scrollIntoView({ behavior: "smooth", block: "center" });
    montarPago(p);
  }

  function cargarPaypal(clientId) {
    if (window.paypal) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons&locale=es_ES`;
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  async function pagar(p) {
    const r = await fetch(`${API}/api/anuncios/pedidos/${p.id}/pagar`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: p.token, orden: p.orden }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || "PayPal no confirmó el pago.");
    return j;
  }

  async function montarPago(p) {
    const box = $("#pay");
    const fallo = (msg) => { box.innerHTML = `<p class="form-err">${esc(msg)}</p>`; };
    if (cfg.paypal.modo === "mock") {
      box.innerHTML = `<button class="btn primary" type="button" id="pagar-prueba"><i class="ph-light ph-credit-card" aria-hidden="true"></i>Pagar ${p.precio} USD (modo de prueba)</button>`;
      $("#pagar-prueba").addEventListener("click", async (e) => {
        e.currentTarget.disabled = true;
        try { listo(p, await pagar(p)); } catch (err) { fallo(err.message); }
      });
      return;
    }
    try {
      await cargarPaypal(cfg.paypal.clientId);
      box.innerHTML = "";
      window.paypal.Buttons({
        style: { layout: "vertical", color: "black", shape: "rect", label: "pay", height: 44 },
        createOrder: () => p.orden,
        onApprove: async () => {
          box.innerHTML = `<p style="color:var(--ink-2)">Confirmando el pago…</p>`;
          try { listo(p, await pagar(p)); } catch (err) { fallo(err.message); }
        },
        onError: () => fallo("PayPal tuvo un problema. No se te cobró nada; vuelve a intentarlo."),
      }).render(box);
    } catch {
      fallo("No pudimos cargar PayPal. Revisa si un bloqueador de anuncios lo está frenando y recarga la página.");
    }
  }

  function listo(p, j) {
    const r = $("#resumen");
    r.dataset.pagado = "1";
    const enlace = new URL(`pedido/?id=${p.id}&t=${p.token}`, location.href.split("#")[0]).href;
    try { localStorage.setItem(`wayout-pedido-${p.id}`, enlace); } catch { /* sin almacenamiento, queda el enlace en pantalla */ }
    r.innerHTML = `<h3>Pagado. Tu anuncio sale el ${fecha(j.inicio)}.</h3>
      <div class="dates"><span>Empieza</span><span>Último día</span><span>Estado</span>
        <b>${corta(j.inicio)}</b><b>${corta(j.ultimoDia)}</b><b>En revisión</b></div>
      <p>PayPal te envió el recibo por correo. Guarda este enlace: ahí ves el estado y las fechas de tu anuncio sin tener que escribirnos.</p>
      <div class="link-box"><code>${esc(enlace)}</code><button class="btn" type="button" id="copiar"><i class="ph-light ph-copy" aria-hidden="true"></i>Copiar enlace</button><a class="btn primary" href="${esc(enlace)}"><i class="ph-light ph-arrow-right" aria-hidden="true"></i>Ver estado</a></div>`;
    $("#copiar").addEventListener("click", async (e) => {
      try { await navigator.clipboard.writeText(enlace); e.currentTarget.innerHTML = `<i class="ph-light ph-check" aria-hidden="true"></i>Copiado`; } catch { /* el enlace sigue visible para copiarlo a mano */ }
    });
    for (const el of $$("input, button[type=submit]", form)) el.disabled = true;
    cargarConfig();
  }

  pintarContadores();
  pintarVista();
  cargarConfig();
})();
