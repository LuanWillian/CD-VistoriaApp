// Câmera dentro do app (celular e tablet): vídeo da câmera traseira em 3:4,
// botão de disparo, conferência ("Usar foto" / "Tirar novamente") e recorte
// central 3:4 ao salvar. No computador, ou se a câmera do app não puder abrir,
// usa o jeito antigo (input de arquivo com capture), para ninguém ficar travado.
//
// Use capturarFoto() em todas as telas: devolve o Blob JPEG pronto para gravar
// (o mesmo formato de antes) ou null se a pessoa cancelar.
import { FOTO_CAMERA } from "./config.js";
import { comprimir, escolherFoto, verificarCamera, MENSAGEM_CAMERA_NEGADA } from "./photos.js";
import { detectarDispositivo } from "./dispositivo.js";
import { esc, icone, avisar as avisarPadrao } from "./ui.js";

// ---------- Partes puras (testadas no Node) ----------
export const restricoesCamera = () => ({
  audio: false,
  video: { facingMode: { ideal: "environment" }, aspectRatio: { ideal: 3 / 4 }, width: { ideal: 1440 }, height: { ideal: 1920 } },
});

// Maior retângulo 3:4 centralizado no quadro do vídeo (igual ao object-fit: cover).
export function recorte34(largura, altura) {
  const alvo = 3 / 4;
  if (largura / altura > alvo) {
    const sw = Math.round(altura * alvo);
    return { sx: Math.round((largura - sw) / 2), sy: 0, sw, sh: altura };
  }
  const sh = Math.round(largura / alvo);
  return { sx: 0, sy: Math.round((altura - sh) / 2), sw: largura, sh };
}

export function motivoErroCamera(e) {
  switch (e?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "negada";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "sem-camera";
    case "NotReadableError":
    case "TrackStartError":
      return "ocupada";
    default:
      return "indisponivel";
  }
}

const MENSAGENS = {
  negada: "A câmera do app foi bloqueada. Para liberar: Configurações do navegador → Permissões → Câmera. Enquanto isso, você pode usar a câmera do aparelho.",
  "sem-camera": "Nenhuma câmera foi encontrada neste aparelho. Você pode escolher uma foto já tirada.",
  ocupada: "A câmera está sendo usada por outro app. Feche o outro app e tente de novo, ou use a câmera do aparelho.",
  indisponivel: "Não foi possível abrir a câmera dentro do app. Use a câmera do aparelho.",
};

// ---------- Decisão: câmera do app ou jeito antigo ----------
const temGetUserMedia = () => Boolean(globalThis.isSecureContext && navigator.mediaDevices?.getUserMedia);

export async function capturarFoto({ titulo = "Foto", avisar = avisarPadrao } = {}) {
  const movel = detectarDispositivo().tipo === "movel";
  if (movel && temGetUserMedia()) return abrirCamera({ titulo });

  // Jeito antigo. O seletor abre antes de qualquer espera, para não perder o toque.
  const escolha = escolherFoto();
  if (movel) {
    avisar("A câmera do app precisa de conexão segura (HTTPS). Usando a câmera do aparelho.", "info");
  } else {
    verificarCamera().then((s) => s === "negada" && avisar(MENSAGEM_CAMERA_NEGADA, "erro"));
  }
  const arquivo = await escolha;
  return arquivo ? comprimir(arquivo) : null;
}

// ---------- Tela da câmera ----------
async function pedirStream() {
  try {
    return await navigator.mediaDevices.getUserMedia(restricoesCamera());
  } catch (e) {
    // Aparelho que não aceita as preferências: tenta qualquer câmera.
    if (e?.name === "OverconstrainedError" || e?.name === "ConstraintNotSatisfiedError") {
      return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    }
    throw e;
  }
}

function fotografar(video) {
  const { sx, sy, sw, sh } = recorte34(video.videoWidth, video.videoHeight);
  const c = document.createElement("canvas");
  c.width = FOTO_CAMERA.largura;
  c.height = FOTO_CAMERA.altura;
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return new Promise((resolver, rejeitar) => c.toBlob((b) => {
    c.width = c.height = 0;
    if (b) resolver(b);
    else rejeitar(new Error("Não foi possível salvar a foto. Tente de novo."));
  }, "image/jpeg", FOTO_CAMERA.qualidade));
}

export function abrirCamera({ titulo = "Foto" } = {}) {
  return new Promise((resolver) => {
    const d = document.createElement("dialog");
    d.className = "camera";
    d.setAttribute("aria-label", `Câmera: ${titulo}`);
    d.innerHTML = `
      <div class="camera-topo">
        <h2>${esc(titulo)}</h2>
        <button type="button" class="btn-topo" data-acao="fechar" aria-label="Fechar câmera">${icone("x")}</button>
      </div>
      <div class="camera-palco">
        <div class="camera-quadro">
          <video autoplay playsinline muted></video>
          <img class="camera-previa" alt="Foto tirada: ${esc(titulo)}" hidden>
          <p class="camera-status" role="status">Abrindo a câmera…</p>
        </div>
      </div>
      <div class="camera-acoes" data-modo="mirar">
        <button type="button" class="camera-disparo" data-acao="capturar" aria-label="Tirar foto" disabled></button>
      </div>
      <div class="camera-acoes" data-modo="conferir" hidden>
        <button type="button" class="btn btn-secundario" data-acao="repetir">Tirar novamente</button>
        <button type="button" class="btn btn-primario" data-acao="usar">${icone("check")} Usar foto</button>
      </div>
      <div class="camera-acoes camera-erro" data-modo="erro" hidden>
        <button type="button" class="btn btn-secundario" data-acao="fechar">Cancelar</button>
        <button type="button" class="btn btn-primario" data-acao="aparelho">${icone("camera")} Usar a câmera do aparelho</button>
      </div>`;
    const video = d.querySelector("video");
    const previa = d.querySelector(".camera-previa");
    const status = d.querySelector(".camera-status");
    const disparo = d.querySelector('[data-acao="capturar"]');
    let stream = null;
    let foto = null;
    let urlPrevia = null;
    let resultado = null; // Blob, Promise<Blob|null> (jeito antigo) ou null
    let fechada = false;

    const modo = (m) => d.querySelectorAll("[data-modo]").forEach((el) => { el.hidden = el.dataset.modo !== m; });
    const pararCamera = () => {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      video.srcObject = null;
    };
    const limparPrevia = () => {
      if (urlPrevia) URL.revokeObjectURL(urlPrevia);
      urlPrevia = null;
      previa.hidden = true;
      previa.removeAttribute("src");
    };
    const mostrarErro = (motivo) => {
      pararCamera();
      status.hidden = false;
      status.textContent = MENSAGENS[motivo] || MENSAGENS.indisponivel;
      video.hidden = true;
      modo("erro");
      d.querySelector('[data-acao="aparelho"]').focus();
    };

    d.addEventListener("click", async (e) => {
      const acao = e.target.closest("[data-acao]")?.dataset.acao;
      if (acao === "fechar") d.close();
      if (acao === "capturar" && !disparo.disabled) {
        disparo.disabled = true;
        try {
          foto = await fotografar(video);
        } catch (erro) {
          status.hidden = false;
          status.textContent = erro.message;
          disparo.disabled = false;
          return;
        }
        urlPrevia = URL.createObjectURL(foto);
        previa.src = urlPrevia;
        previa.hidden = false;
        video.hidden = true;
        modo("conferir");
        d.querySelector('[data-acao="usar"]').focus();
      }
      if (acao === "repetir") {
        foto = null;
        limparPrevia();
        video.hidden = false;
        modo("mirar");
        disparo.disabled = false;
        disparo.focus();
      }
      if (acao === "usar" && foto) {
        resultado = foto;
        d.close();
      }
      if (acao === "aparelho") {
        // Abre o seletor ainda dentro do toque (o iPhone exige isso).
        const escolha = escolherFoto();
        resultado = escolha.then((arquivo) => (arquivo ? comprimir(arquivo) : null));
        d.close();
      }
    });

    const fechar = () => { if (d.open) d.close(); };
    d.addEventListener("close", () => {
      fechada = true;
      pararCamera();
      limparPrevia();
      removeEventListener("hashchange", fechar);
      removeEventListener("pagehide", fechar);
      d.remove();
      resolver(resultado);
    });
    // Voltar do Android, troca de tela ou app fechado: desliga a câmera.
    addEventListener("hashchange", fechar);
    addEventListener("pagehide", fechar);

    document.body.append(d);
    d.showModal();

    pedirStream().then(async (s) => {
      if (fechada) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = s;
      video.srcObject = s;
      await video.play().catch(() => {});
      if (!video.videoWidth) {
        await new Promise((ok) => video.addEventListener("loadedmetadata", ok, { once: true }));
      }
      if (fechada) return;
      status.hidden = true;
      disparo.disabled = false;
      disparo.focus();
    }).catch((e) => {
      if (!fechada) mostrarErro(motivoErroCamera(e));
    });
  });
}
