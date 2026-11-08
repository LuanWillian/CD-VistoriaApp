// Funções puras de formatação e de formato dos dados (rascunho, vistoria,
// nomes de arquivo). Não acessam o DOM nem APIs do navegador: rodam no Node.

const pad = (n, t = 2) => String(n).padStart(t, "0");

// ---------- Datas (sempre no fuso do aparelho) ----------
export function formatarData(iso) {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatarDataHora(iso) {
  const d = new Date(iso);
  return `${formatarData(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dataArquivo(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const meiaNoite = (ano, mes, dia) => new Date(ano, mes, dia).toISOString();

// "hoje" = desde a meia-noite local; "7d"/"30d" incluem hoje.
export function periodo(tipo, agora = new Date()) {
  const dias = { hoje: 1, "7d": 7, "30d": 30 }[tipo];
  if (!dias) return { de: null, ate: null };
  return { de: meiaNoite(agora.getFullYear(), agora.getMonth(), agora.getDate() - (dias - 1)), ate: null };
}

// Datas "aaaa-mm-dd" dos campos De/Até; "ate" é exclusivo (meia-noite do dia seguinte).
export function periodoPersonalizado(de, ate) {
  const ler = (s, somaDias) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    return m ? meiaNoite(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + somaDias) : null;
  };
  return { de: ler(de, 0), ate: ler(ate, 1) };
}

// ---------- Km e chassi ----------
export function formatarKm(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function lerKm(texto) {
  const digitos = String(texto ?? "").replace(/\D/g, "");
  return digitos ? Number(digitos) : null;
}

export function normalizarChassi(texto) {
  return String(texto ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

// ---------- Identificação ----------
export function idProvisorio(uuid) {
  return "Provisório " + String(uuid).replace(/-/g, "").slice(0, 4).toUpperCase();
}

export function nomeVistoria(v) {
  return v.numero || idProvisorio(v.id);
}

export function nomeArquivoPdf(v) {
  return `Vistoria_${v.chassi}_${dataArquivo(v.realizadaEm)}.pdf`;
}

// ---------- Arquivos (fotos e assinaturas) ----------
export const ARQUIVO = {
  frente: "frente.jpg",
  frenteMini: "frente_mini.jpg",
  traseira: "traseira.jpg",
  chassi: "chassi.jpg",
  assVistoriador: "assinatura_vistoriador.png",
  assMotorista: "assinatura_motorista.png",
};

export const arquivoAvaria = (fotoId) => `avaria_${fotoId}.jpg`;
export const chaveLocal = (id, nome) => `${id}/${nome}`;
export const caminhoRemoto = (userId, id, nome) => `${userId}/${id}/${nome}`;

const ROTULOS = {
  [ARQUIVO.frente]: "Frente",
  [ARQUIVO.frenteMini]: "Frente (miniatura)",
  [ARQUIVO.traseira]: "Traseira",
  [ARQUIVO.chassi]: "Chassi",
  [ARQUIVO.assVistoriador]: "Assinatura do vistoriador",
  [ARQUIVO.assMotorista]: "Assinatura do motorista do reboque",
};

export function rotuloArquivo(nome) {
  if (ROTULOS[nome]) return ROTULOS[nome];
  return nome.startsWith("avaria_") ? "Foto de avaria" : nome;
}

export function arquivosDaVistoria(v) {
  return [
    ARQUIVO.frente, ARQUIVO.frenteMini, ARQUIVO.traseira, ARQUIVO.chassi,
    ...(v.avarias || []).flatMap((a) => (a.fotos || []).map(arquivoAvaria)),
    ARQUIVO.assVistoriador, ARQUIVO.assMotorista,
  ];
}

// ---------- Texto para o PDF ----------
// A Helvetica do jsPDF só desenha WinAnsi: Latin-1 e alguns sinais tipográficos.
// Emoji e outros caracteres são removidos para não virarem lixo no laudo.
const EXTRAS_WINANSI = "“”‘’–—•…€";
const desenhavel = (ch) => {
  const c = ch.codePointAt(0);
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || EXTRAS_WINANSI.includes(ch);
};

export function textoPdf(s) {
  return String(s ?? "")
    .split(/\r?\n/)
    .map((linha) => [...linha].filter(desenhavel).join("").replace(/ {2,}/g, " ").replace(/ +([,.;:!?])/g, "$1").trim())
    .join("\n");
}

// ---------- Rascunho e vistoria ----------
export function novoRascunho(userId, id, agoraIso) {
  return {
    id,
    userId,
    etapa: 1,
    criadoEm: agoraIso,
    atualizadoEm: agoraIso,
    dados: {
      chassi: "", marca: "", modelo: "", cor: "", km: null, combustivel: null,
      fotos: { frente: false, traseira: false, chassi: false },
      checklist: {}, checklistObs: "",
      semAvarias: false, avarias: [],
      vistoriadorNome: "", motoristaNome: "",
      assinaturas: { vistoriador: false, motorista: false },
    },
  };
}

export function vistoriaDoRascunho(rascunho, realizadaEm) {
  const d = structuredClone(rascunho.dados);
  return {
    id: rascunho.id,
    userId: rascunho.userId,
    numero: null,
    realizadaEm,
    chassi: d.chassi,
    marca: d.marca.trim(),
    modelo: d.modelo.trim(),
    cor: d.cor.trim(),
    km: Number(d.km),
    combustivel: d.combustivel,
    checklist: d.checklist,
    checklistObs: d.checklistObs.trim(),
    semAvarias: d.semAvarias,
    avarias: d.avarias,
    vistoriadorNome: d.vistoriadorNome.trim(),
    motoristaNome: d.motoristaNome.trim(),
    status: "pendente",
    erro: null,
    enviados: [],
    origem: "local",
    completa: true,
    avariasQtd: d.avarias.length,
    arquivosSalvosEm: realizadaEm,
    atualizadoEm: realizadaEm,
  };
}
