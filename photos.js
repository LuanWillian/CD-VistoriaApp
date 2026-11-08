// Fotos: captura pela câmera (input de arquivo), compressão, miniatura e
// visualizador em tela cheia.
import { FOTO } from "./config.js";
import { esc, icone } from "./ui.js";

export const MENSAGEM_CAMERA_NEGADA = "A câmera está bloqueada para este app. Libere em Configurações do navegador → Permissões → Câmera. Você ainda pode escolher uma foto da galeria.";
const ERRO_LEITURA = "Não foi possível ler esta foto. Tente tirar outra.";

// Abre a câmera traseira (no desktop, o seletor de arquivos). Resolve null se cancelar.
export function escolherFoto({ camera = true } = {}) {
  return new Promise((resolver) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (camera) input.setAttribute("capture", "environment");
    input.hidden = true;
    let feito = false;
    const fim = (arquivo) => {
      if (feito) return;
      feito = true;
      input.remove();
      resolver(arquivo);
    };
    input.addEventListener("change", () => fim(input.files?.[0] || null));
    input.addEventListener("cancel", () => fim(null));
    document.body.append(input);
    input.click();
  });
}

// Decodifica respeitando a orientação EXIF; cai para <img> se o navegador
// não aceitar as opções do createImageBitmap.
async function decodificar(arquivo) {
  try {
    return await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  } catch { /* tenta sem opções */ }
  try {
    return await createImageBitmap(arquivo);
  } catch { /* tenta com <img> */ }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error(ERRO_LEITURA);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function comprimir(arquivo, { maxLado = FOTO.maxLado, qualidade = FOTO.qualidade } = {}) {
  const imagem = await decodificar(arquivo);
  const largura = imagem.naturalWidth || imagem.width;
  const altura = imagem.naturalHeight || imagem.height;
  if (!largura || !altura) throw new Error(ERRO_LEITURA);
  const k = Math.min(1, maxLado / Math.max(largura, altura));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(largura * k);
  canvas.height = Math.round(altura * k);
  const g = canvas.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.imageSmoothingQuality = "high";
  g.drawImage(imagem, 0, 0, canvas.width, canvas.height);
  imagem.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", qualidade));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error(ERRO_LEITURA);
  return blob;
}

export const gerarMiniatura = (blob) => comprimir(blob, { maxLado: FOTO.miniLado, qualidade: FOTO.qualidade });

export async function verificarCamera() {
  try {
    const estado = await navigator.permissions?.query({ name: "camera" });
    if (!estado) return "desconhecido";
    return estado.state === "denied" ? "negada" : "ok";
  } catch {
    return "desconhecido";
  }
}

// ---------- Visualizador em tela cheia ----------
export function abrirVisualizador(fotos, indice = 0) {
  if (!fotos.length) return;
  let atual = Math.min(Math.max(indice, 0), fotos.length - 1);
  const d = document.createElement("dialog");
  d.className = "cheio visualizador";
  d.setAttribute("aria-label", "Foto em tela cheia");
  d.innerHTML = `
    <div class="cheio-topo">
      <h2 aria-live="polite"></h2>
      <button type="button" class="btn-topo" data-acao="fechar" aria-label="Fechar">${icone("x")}</button>
    </div>
    <div class="visualizador-palco">
      <button type="button" class="btn-topo" data-acao="-1" aria-label="Foto anterior">${icone("voltar", "ic ic-lg")}</button>
      <img alt="">
      <button type="button" class="btn-topo" data-acao="1" aria-label="Próxima foto">${icone("avancar", "ic ic-lg")}</button>
    </div>`;
  const titulo = d.querySelector("h2");
  const img = d.querySelector("img");
  const navs = d.querySelectorAll('[data-acao="-1"], [data-acao="1"]');
  const mostrar = () => {
    const f = fotos[atual];
    img.src = f.src;
    img.alt = f.legenda;
    titulo.textContent = fotos.length > 1 ? `${f.legenda} (${atual + 1} de ${fotos.length})` : f.legenda;
    navs.forEach((b) => { b.hidden = fotos.length < 2; });
  };
  const ir = (passo) => {
    if (fotos.length < 2) return;
    atual = (atual + passo + fotos.length) % fotos.length;
    mostrar();
  };
  d.addEventListener("click", (e) => {
    const acao = e.target.closest("[data-acao]")?.dataset.acao;
    if (acao === "fechar") d.close();
    else if (acao) ir(Number(acao));
  });
  d.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") ir(-1);
    if (e.key === "ArrowRight") ir(1);
  });
  let x0 = null;
  d.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
  d.addEventListener("pointerup", (e) => {
    if (x0 !== null && Math.abs(e.clientX - x0) > 50) ir(e.clientX < x0 ? 1 : -1);
    x0 = null;
  });
  d.addEventListener("close", () => d.remove());
  document.body.append(d);
  mostrar();
  d.showModal();
}

// HTML de uma miniatura que abre o visualizador (as telas ligam o clique).
export const miniaturaHtml = (src, legenda, extra = "") => `
  <div class="miniatura">
    <button type="button" data-ampliar="${esc(src)}" data-legenda="${esc(legenda)}" aria-label="Ampliar: ${esc(legenda)}">
      <img src="${esc(src)}" alt="${esc(legenda)}">
    </button>${extra}
  </div>`;

// Liga, dentro de `raiz`, o toque nas miniaturas [data-ampliar] ao visualizador.
export function ligarAmpliar(raiz) {
  raiz.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ampliar]");
    if (!b) return;
    const todos = [...raiz.querySelectorAll("[data-ampliar]")];
    abrirVisualizador(todos.map((x) => ({ src: x.dataset.ampliar, legenda: x.dataset.legenda })), todos.indexOf(b));
  });
}
