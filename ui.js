// Utilidades de interface: seletores, escape de HTML, ícones, avisos,
// diálogo de confirmação e carregamento de scripts sob demanda.

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

let contadorIds = 0;
export const idUnico = (prefixo = "id") => `${prefixo}-${++contadorIds}`;

// Traços no estilo Lucide (24×24, stroke).
const ICONES = {
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
  lixeira: '<path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  editar: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  voltar: '<path d="m15 18-6-6 6-6"/>',
  avancar: '<path d="m9 18 6-6-6-6"/>',
  pdf: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M12 18v-6M9 15l3 3 3-3"/>',
  compartilhar: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  atualizar: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  nuvem: '<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z"/>',
  nuvemOff: '<path d="m2 2 20 20"/><path d="M5.8 5.8A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.3-.2M21.5 15.5A4.5 4.5 0 0 0 17.5 10h-1.8A7 7 0 0 0 10 5.1"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  imagem: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  borracha: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21M22 21H7M5 11l9 9"/>',
  busca: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  calendario: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  carregando: '<path d="M21 12a9 9 0 1 1-6.2-8.6"/>',
  prancheta: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  novo: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M12 12v6M9 15h6"/>',
  loja: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4"/>',
  // Visual do computador (mesmos ícones Lucide do design).
  relogio: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6h4.5"/>',
  checkCirculo: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  alertaCirculo: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  nuvemEnviar: '<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="M12 12v9M16 16l-4-4-4 4"/>',
  pranchetaLista: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
  banco: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  recarregar: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  setaBaixo: '<path d="m6 9 6 6 6-6"/>',
  setaEsquerda: '<path d="m12 19-7-7 7-7M19 12H5"/>',
  graficoBarras: '<path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3"/>',
  carro: '<path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.65 5H8.4a2 2 0 0 0-1.9 1.26L5 10 3 8M7 14h.01M17 14h.01"/><rect width="18" height="8" x="3" y="10" rx="2"/><path d="M5 18v2M19 18v2"/>',
  fachada: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>',
  lixeira2: '<path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6"/>',
};

export function icone(nome, classe = "ic") {
  return `<svg class="${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONES[nome] || ""}</svg>`;
}

export const carregandoHtml = (texto = "Carregando…") =>
  `<div class="carregando" role="status">${icone("carregando", "ic ic-lg gira")}<span>${esc(texto)}</span></div>`;

// ---------- Avisos ----------
function areaDeAvisos() {
  let area = document.getElementById("avisos");
  if (!area) {
    area = document.createElement("div");
    area.id = "avisos";
    area.className = "avisos";
    area.setAttribute("aria-live", "polite");
    document.body.append(area);
  }
  return area;
}

export function avisar(texto, tipo = "info") {
  const aviso = document.createElement("div");
  aviso.className = `aviso aviso-${tipo}`;
  if (tipo === "erro") aviso.setAttribute("role", "alert");
  aviso.textContent = texto;
  areaDeAvisos().append(aviso);
  setTimeout(() => aviso.remove(), tipo === "erro" ? 7000 : 4000);
}

// ---------- Confirmação ----------
export function confirmar({ titulo, texto = "", ok = "Confirmar", cancelar = "Cancelar", perigo = false }) {
  return new Promise((resolver) => {
    const d = document.createElement("dialog");
    const idTitulo = idUnico("confirmar");
    d.setAttribute("aria-labelledby", idTitulo);
    d.innerHTML = `
      <div class="dialogo-corpo">
        <h2 id="${idTitulo}">${esc(titulo)}</h2>
        ${texto ? `<p>${esc(texto)}</p>` : ""}
      </div>
      <div class="dialogo-acoes">
        <button type="button" class="btn btn-secundario" data-resposta="nao">${esc(cancelar)}</button>
        <button type="button" class="btn ${perigo ? "btn-perigo-cheio" : "btn-primario"}" data-resposta="sim">${esc(ok)}</button>
      </div>`;
    const anterior = document.activeElement;
    let resposta = false;
    d.addEventListener("click", (e) => {
      const b = e.target.closest("[data-resposta]");
      if (!b) return;
      resposta = b.dataset.resposta === "sim";
      d.close();
    });
    d.addEventListener("close", () => {
      d.remove();
      anterior?.focus?.();
      resolver(resposta);
    });
    document.body.append(d);
    d.showModal();
    $(perigo ? '[data-resposta="nao"]' : '[data-resposta="sim"]', d).focus();
  });
}

// ---------- Scripts sob demanda (jsPDF) ----------
const scripts = new Map();
export function carregarScript(src) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolver, rejeitar) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolver();
      s.onerror = () => {
        scripts.delete(src);
        rejeitar(new Error(`Não foi possível carregar ${src}.`));
      };
      document.head.append(s);
    }));
  }
  return scripts.get(src);
}
