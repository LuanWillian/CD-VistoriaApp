// Laudo de vistoria em PDF (A4), gerado no próprio aparelho com jsPDF e
// jspdf-autotable (arquivos locais em vendor/, carregados só quando necessário).
// Visual no estilo do app (fonte Satoshi, cinzas do app, selos com bolinha):
// faixa escura no topo com o título "Vistoria de expedição do CD", seções sem
// cartão separadas por linha fina, dados em grade de 3 colunas, checklist em
// 2 colunas (selos OK / Ausente), fotos com cantos arredondados, cartões de
// avaria com faixa na cor da gravidade, assinaturas em caixas cinza e rodapé
// com PrimeCheck, número, chassi e página. Da 2ª página em diante, uma faixa
// escura fina repete o título e o número.
import { CHECKLIST_ITENS, EMPRESA, FOTOS_VEICULO, GRAVIDADES, PDF_FOTO } from "./config.js";
import {
  ARQUIVO, arquivoAssinaturaReceb, arquivoAvaria, arquivoReceb, formatarDataHora, formatarKm, formatarMarca, nomeArquivoPdf, nomeVistoria, textoPdf,
} from "./formatos.js";
import { STATUS_RECEBIMENTO } from "./recebimento-dados.js";
import { carregarScript } from "./ui.js";

export class ImagemAusenteError extends Error {
  constructor() {
    super("Algumas fotos ainda não estão neste aparelho. Conecte-se à internet para gerar o PDF.");
    this.name = "ImagemAusenteError";
  }
}

export class ErroPdf extends Error {
  constructor(detalhe) {
    super(`Não foi possível gerar o PDF. Tente novamente. (${detalhe})`);
    this.name = "ErroPdf";
  }
}

const BIBLIOTECAS = ["./vendor/jspdf-4.2.1.umd.min.js", "./vendor/jspdf-autotable-5.0.9.min.js"]
  .map((caminho) => new URL(caminho, import.meta.url).href);

async function carregarBibliotecas() {
  for (const src of BIBLIOTECAS) await carregarScript(src);
  if (!globalThis.jspdf?.jsPDF || !globalThis.autoTable) throw new Error("bibliotecas de PDF indisponíveis");
}


// Fontes do laudo (arquivos locais em vendor/fontes, guardados offline pelo
// service worker): Satoshi, a mesma do app. "SatoshiM" é o peso médio (500).
// Se não carregarem, o laudo sai em Helvetica.
const FONTES = [
  ["Satoshi", "normal", "Satoshi-400.ttf"],
  ["Satoshi", "bold", "Satoshi-700.ttf"],
  ["SatoshiM", "normal", "Satoshi-500.ttf"],
];
let fontesCarregadas = null;
function carregarFontes() {
  fontesCarregadas ||= Promise.all(FONTES.map(async ([familia, estilo, arquivo]) => {
    const resposta = await fetch(new URL(`./vendor/fontes/${arquivo}`, import.meta.url));
    if (!resposta.ok) throw new Error(`fonte ${arquivo} indisponível`);
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    let binario = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { familia, estilo, arquivo, base64: btoa(binario) };
  })).catch(() => {
    fontesCarregadas = null;
    return null;
  });
  return fontesCarregadas;
}

// ---------- Medidas (mm) e cores ----------
// O desenho de referência tem 794 px de largura: 1 px = 0,2645 mm = 0,75 pt.
const PAG_L = 210;
const M = 10.6; // margem lateral (40 px)
const LARG = PAG_L - 2 * M;
const FAIXA_TOPO = 32; // faixa escura da 1ª página
const VAO_SECAO = 5.3; // espaço antes de cada seção
const FAIXA_FINA = 10.6; // faixa escura das outras páginas
const LIMITE = 279; // abaixo disso fica o rodapé
const COR = {
  escuro: [0, 0, 0], // preto da marca nas faixas do topo
  texto: [17, 24, 39],
  texto2: [75, 85, 99], // #4B5563
  cinza: [107, 114, 128], // #6B7280
  apagado: [156, 163, 175], // #9CA3AF (só sobre o fundo escuro)
  linha: [229, 231, 235], // #E5E7EB
  suave: [241, 242, 244], // #F1F2F4
  painel: [246, 247, 249], // #F6F7F9
  branco: [255, 255, 255],
};
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
// Selos claros com bolinha, iguais aos do app.
const SELO = {
  ok: { fundo: rgb("#E5F3E9"), cor: rgb("#166534"), ponto: rgb("#1B7F3B") },
  erro: { fundo: rgb("#FDECEA"), cor: rgb("#B3261E"), ponto: rgb("#B3261E") },
};


// Reamostra a imagem para o PDF; JPEG para fotos, PNG para assinaturas (transparência).
// Com `proporcao` (largura/altura), recorta o centro para preencher a moldura.
async function prepararImagem(blob, maxLado, tipo = "JPEG", proporcao = null) {
  const bmp = await createImageBitmap(blob);
  let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
  if (proporcao) {
    if (sw / sh > proporcao) {
      sw = Math.round(sh * proporcao);
      sx = Math.round((bmp.width - sw) / 2);
    } else {
      sh = Math.round(sw / proporcao);
      sy = Math.round((bmp.height - sh) / 2);
    }
  }
  const k = Math.min(1, maxLado / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * k));
  c.height = Math.max(1, Math.round(sh * k));
  const g = c.getContext("2d");
  if (tipo === "JPEG") {
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
  }
  g.drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height);
  bmp.close?.();
  const dados = tipo === "JPEG" ? c.toDataURL("image/jpeg", PDF_FOTO.qualidade) : c.toDataURL("image/png");
  const img = { dados, w: c.width, h: c.height, tipo };
  c.width = c.height = 0;
  return img;
}

const encaixar = (img, x, y, w, h) => {
  const k = Math.min(w / img.w, h / img.h);
  const iw = img.w * k;
  const ih = img.h * k;
  return { x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih };
};

export async function gerarPdf(vistoria, obterImagem, { depurar = false } = {}) {
  try {
    await carregarBibliotecas();
    const fontes = await carregarFontes();
    return await montarPdf(vistoria, obterImagem, depurar, fontes);
  } catch (e) {
    if (e instanceof ImagemAusenteError || e instanceof ErroPdf) throw e;
    throw new ErroPdf(e?.message || String(e));
  }
}


async function montarPdf(v, obterImagem, depurar, fontes) {
  const { jsPDF } = globalThis.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  fontes?.forEach((f) => {
    doc.addFileToVFS(f.arquivo, f.base64);
    doc.addFont(f.arquivo, f.familia, f.estilo);
  });
  const TXT = fontes ? "Satoshi" : "helvetica";
  const MED = fontes ? "SatoshiM" : "helvetica";
  const MONO = "courier";
  const textos = [];
  const posicoes = [];
  const selos = [];
  const faixas = [];
  const quebras = [];
  const avarias = v.semAvarias ? [] : v.avarias || [];
  const totalFotos = 3 + avarias.reduce((n, a) => n + a.fotos.length, 0);
  const maxLado = totalFotos > PDF_FOTO.limiteMuitas ? PDF_FOTO.maxLadoMuitas : PDF_FOTO.maxLado;
  const identificacao = v.numero || `${nomeVistoria(v)} (aguardando sincronização)`;
  const quando = formatarDataHora(v.realizadaEm);
  const TITULO = "Vistoria de expedição do CD";

  const imagem = async (arquivo, { tipo = "JPEG", lado = maxLado, proporcao = null } = {}) => {
    const blob = await obterImagem(arquivo);
    if (!blob) throw new ImagemAusenteError();
    return prepararImagem(blob, lado, tipo, proporcao);
  };

  // ---------- Ajudantes de desenho ----------
  let y = M;
  let topoPagina = true; // nada escrito ainda na página: a seção não precisa de espaço antes
  // A Satoshi não tem "º" e "ª": viram "o" e "a" para não sumirem do laudo.
  const limpar = (s) => {
    const t = textoPdf(s);
    return fontes ? t.replace(/º/g, "o").replace(/ª/g, "a") : t;
  };
  const fonte = (estilo, tamanho, cor = COR.texto, familia = TXT) => {
    doc.setFont(familia, estilo);
    doc.setFontSize(tamanho);
    doc.setTextColor(...cor);
  };
  const medio = (tamanho, cor = COR.texto) => fonte("normal", tamanho, cor, MED);
  const escrever = (texto, x, yy, opcoes) => {
    const t = Array.isArray(texto) ? texto : limpar(texto);
    doc.text(t, x, yy, opcoes);
    const lista = Array.isArray(t) ? t : [t];
    textos.push(...lista);
    if (depurar) {
      const pagina = doc.getCurrentPageInfo().pageNumber;
      lista.forEach((item) => posicoes.push({ texto: item, pagina }));
    }
  };
  const largura = (texto) => doc.getTextWidth(limpar(texto));
  const umaLinha = (texto, larguraMax) => doc.splitTextToSize(limpar(String(texto ?? "")), larguraMax)[0] || "—";
  const linhas = (texto, larguraMax, tamanho) => {
    fonte("normal", tamanho);
    return doc.splitTextToSize(limpar(texto), larguraMax);
  };
  const linha = (x1, y1, x2, y2, cor = COR.linha, espessura = 0.26) => {
    doc.setDrawColor(...cor);
    doc.setLineWidth(espessura);
    doc.line(x1, y1, x2, y2);
  };
  const caixa = (x, yy, w, h, r, cor) => {
    doc.setFillColor(...cor);
    doc.roundedRect(x, yy, w, h, r, r, "F");
  };
  // Desenha só dentro de um retângulo de cantos arredondados (fotos e faixa das avarias).
  const recortar = (x, yy, w, h, r, desenhar) => {
    doc.saveGraphicsState();
    doc.roundedRect(x, yy, w, h, r, r, null);
    doc.clip();
    doc.discardPath();
    desenhar();
    doc.restoreGraphicsState();
  };
  const foto = (img, x, yy, w, h, r = 2.6) =>
    recortar(x, yy, w, h, r, () => doc.addImage(img.dados, "JPEG", x, yy, w, h, undefined, "FAST"));

  // Selo arredondado. Com `ponto`, é o selo claro com bolinha do app (OK, Ausente,
  // recebimento); sem, é o selo cheio da gravidade.
  const selo = (texto, x, yBase, { alinhar = "esquerda", fundo, cor, ponto = null }) => {
    medio(8.25, cor);
    const folga = 2.1;
    const espacoPonto = ponto ? 2.6 : 0;
    const w = largura(texto) + 2 * folga + espacoPonto;
    const x0 = alinhar === "direita" ? x - w : x;
    const h = 4.8;
    const topo = yBase - 3.25;
    selos.push({ texto, fundo, cor });
    caixa(x0, topo, w, h, h / 2, fundo);
    if (ponto) {
      doc.setFillColor(...ponto);
      doc.circle(x0 + folga + 0.75, topo + h / 2, 0.75, "F");
    }
    escrever(texto, x0 + folga + espacoPonto, yBase);
    return w;
  };
  const seloStatus = (texto, x, yBase, erro, alinhar = "direita") =>
    selo(texto, x, yBase, { alinhar, ...(erro ? SELO.erro : SELO.ok) });

  // Da 2ª página em diante: faixa escura fina com o título e o número.
  // `precisava` e `oQue` só servem para os testes: cada quebra fica registrada
  // com o espaço que sobrou na página e a altura do bloco que não coube.
  const novaPagina = (precisava = 0, oQue = "") => {
    quebras.push({ pagina: doc.getNumberOfPages(), sobra: LIMITE - y, precisava, oQue });
    doc.addPage();
    doc.setFillColor(...COR.escuro);
    doc.rect(0, 0, PAG_L, FAIXA_FINA, "F");
    fonte("bold", 9.75, COR.branco);
    const inicio = `${TITULO} ·`;
    escrever(inicio, M, 6.7);
    const xNumero = M + largura(inicio) + 1.3;
    fonte("bold", 9.5, COR.branco, MONO);
    escrever(identificacao, xNumero, 6.7);
    y = FAIXA_FINA + VAO_SECAO;
    topoPagina = true;
  };
  const garantir = (altura, oQue = "") => {
    if (y + altura > LIMITE) novaPagina(altura, oQue);
  };
  // Título da seção em maiúsculas à esquerda, informação (ou selo) à direita e linha fina.
  const secao = (nomeSecao, alturaMinimaConteudo, direita = "", seloDireita = null) => {
    const vao = topoPagina ? 0 : VAO_SECAO;
    if (y + vao + 9 + alturaMinimaConteudo > LIMITE) novaPagina(vao + 9 + alturaMinimaConteudo, `seção ${nomeSecao}`);
    else y += vao;
    const base = y + 3.4;
    fonte("bold", 9.75, COR.texto);
    escrever(nomeSecao.toUpperCase(), M, base, { charSpace: 0.08 });
    if (direita) {
      fonte("normal", 9, COR.cinza);
      escrever(direita, M + LARG, base, { align: "right" });
    }
    if (seloDireita) seloStatus(seloDireita.texto, M + LARG, base, seloDireita.erro);
    linha(M, y + 5.6, M + LARG, y + 5.6);
    y += 5.6 + 3.2;
    topoPagina = false;
  };

  // ---------- 1. Cabeçalho (faixa escura) ----------
  doc.setFillColor(...COR.escuro);
  doc.rect(0, 0, PAG_L, FAIXA_TOPO, "F");
  medio(8.25, COR.apagado);
  escrever("PRIMECHECK", M, 10.8, { charSpace: 0.15 });
  fonte("normal", 9.75, COR.apagado);
  escrever(quando, M + LARG, 11.2, { align: "right" });
  fonte("bold", 16.5, COR.branco);
  escrever(TITULO, M, 18.6);
  // Empresa · endereço numa linha só: diminui a letra até caber (mínimo 7,5 pt).
  const endereco = `${EMPRESA.nome} · ${EMPRESA.endereco}`;
  let tamanhoEnd = 9.75;
  while (tamanhoEnd > 7.5 && (fonte("normal", tamanhoEnd, COR.apagado), largura(endereco)) > LARG) tamanhoEnd -= 0.25;
  escrever(endereco, M, 24.8);
  y = FAIXA_TOPO + VAO_SECAO;
  topoPagina = true;

  // ---------- 2. Dados do veículo ----------
  // Ordem pedida: Chassi, Marca, Modelo / Cor, Quilometragem (km), Combustível.
  const alturaLinhaDados = 10;
  const passoDados = alturaLinhaDados + 3.2;
  const alturaGrade = passoDados + alturaLinhaDados;
  // Loja de destino numa linha própria, na largura toda, depois de uma divisória.
  // Vistorias antigas não têm loja: a linha não aparece.
  const alturaLoja = v.loja ? 3.2 + 2.6 + alturaLinhaDados : 0;
  secao("Dados do veículo", alturaGrade + alturaLoja);
  const vaoDados = 8.5;
  const colW = (LARG - 2 * vaoDados) / 3;
  const campo = (rotulo, valor, x, yy, w, mono = false) => {
    fonte("normal", 8.25, COR.cinza);
    escrever(rotulo, x, yy + 3);
    if (mono) fonte("bold", 10.5, COR.texto, MONO);
    else medio(10.5);
    escrever(umaLinha(valor || "—", w), x, yy + 8.2);
  };
  [
    ["Chassi", v.chassi, true], ["Marca", formatarMarca(v.marca ?? "")], ["Modelo", v.modelo],
    ["Cor", v.cor], ["Quilometragem (km)", formatarKm(v.km)], ["Combustível", v.combustivel],
  ].forEach(([rotulo, valor, mono], i) => {
    campo(rotulo, valor, M + (i % 3) * (colW + vaoDados), y + Math.floor(i / 3) * passoDados, colW, mono);
  });
  y += alturaGrade;
  if (v.loja) {
    linha(M, y + 3.2, M + LARG, y + 3.2, COR.suave);
    campo("Loja de destino", v.loja, M, y + 5.8, LARG);
    y += alturaLoja;
  }

  // ---------- 3. Checklist de equipamentos ----------
  const itens = [...CHECKLIST_ITENS, ...Object.keys(v.checklist || {}).filter((i) => !CHECKLIST_ITENS.includes(i))];
  const estado = (item) => v.checklist?.[item];
  // Presentes primeiro, depois ausentes (na ordem do checklist), em 2 colunas:
  // a da esquerda de cima para baixo, depois a da direita.
  const ordenados = [...itens.filter((i) => estado(i) === "presente"), ...itens.filter((i) => estado(i) !== "presente")];
  const presentes = itens.filter((i) => estado(i) === "presente").length;
  const vaoColunas = 12.7;
  const colChk = (LARG - vaoColunas) / 2;
  const alturaItem = 7.4;
  const linhasChk = Math.ceil(ordenados.length / 2);
  const colunas = [ordenados.slice(0, linhasChk), ordenados.slice(linhasChk)];
  secao("Checklist de equipamentos", Math.min(linhasChk, 3) * alturaItem, `${presentes} de ${itens.length} presentes`);
  for (let l = 0; l < linhasChk; l++) {
    garantir(alturaItem, "linha do checklist");
    colunas.forEach((coluna, c) => {
      const item = coluna[l];
      if (!item) return;
      const x = M + c * (colChk + vaoColunas);
      const yBase = y + 4.9;
      fonte("normal", 9.75, COR.texto2);
      escrever(umaLinha(item, colChk - 20), x, yBase);
      if (estado(item) === "presente") seloStatus("OK", x + colChk, yBase, false);
      else if (estado(item) === "ausente") seloStatus("Ausente", x + colChk, yBase, true);
      else {
        fonte("normal", 9.75, COR.cinza);
        escrever("—", x + colChk, yBase, { align: "right" });
      }
      if (l < coluna.length - 1) linha(x, y + alturaItem, x + colChk, y + alturaItem, COR.suave);
    });
    y += alturaItem;
  }
  if (v.checklistObs) {
    // Caixa cinza: "Observação:" no peso médio e o texto em cinza.
    const prefixo = "Observação:";
    const obs = linhas(`${prefixo} ${v.checklistObs}`, LARG - 6.4 - 1.5, 9.75);
    const alturaObs = obs.length * 5 + 3.4;
    garantir(alturaObs + 3.2, "observação do checklist");
    y += 3.2;
    caixa(M, y, LARG, alturaObs, 2.1, COR.painel);
    obs.forEach((texto, i) => {
      const base = y + 5.3 + i * 5;
      if (i === 0 && texto.startsWith(prefixo)) {
        medio(9.75, COR.texto);
        escrever(prefixo, M + 3.2, base);
        const x = M + 3.2 + largura(prefixo) + 1.1;
        fonte("normal", 9.75, COR.texto2);
        escrever(texto.slice(prefixo.length).trim(), x, base);
      } else {
        fonte("normal", 9.75, COR.texto2);
        escrever(texto, M + 3.2, base);
      }
    });
    y += alturaObs;
  }

  // ---------- 4. Registro fotográfico ----------
  const vaoFoto = 5.3;
  const fotoW = (LARG - 2 * vaoFoto) / 3;
  const fotoH = fotoW * 0.75;
  secao("Registro fotográfico", fotoH + 5.3);
  const fotosVeiculo = await Promise.all(FOTOS_VEICULO.map((f) => imagem(ARQUIVO[f.chave], { proporcao: 4 / 3 })));
  FOTOS_VEICULO.forEach((f, i) => {
    const x = M + i * (fotoW + vaoFoto);
    foto(fotosVeiculo[i], x, y, fotoW, fotoH);
    fonte("normal", 9, COR.cinza);
    escrever(f.rotulo, x + fotoW / 2, y + fotoH + 4.6, { align: "center" });
  });
  y += fotoH + 5.3;

  // ---------- 5. Registro de avarias ----------
  if (!avarias.length) {
    // Sem avarias: só a linha do título, com o aviso à direita (economiza espaço
    // para a vistoria sem avarias caber numa página).
    secao("Registro de avarias", 0, "Veículo sem avarias registradas");
    y -= 3.2;
  } else {
    const faixa = 1.06;
    const pad = 4.2;
    const raio = 3.2;
    const vaoMini = 2.1;
    const fotoColW = 50.8;
    const principalH = fotoColW * 0.75;
    const miniW = (fotoColW - 2 * vaoMini) / 3;
    const miniH = miniW * 0.75;
    const xTexto = M + faixa + pad;
    const larguraInterna = LARG - faixa - 2 * pad;
    const celW = (larguraInterna - 3 * vaoMini) / 4;
    const celH = celW * 0.75;
    const medir = (a) => {
      const temFoto = a.fotos.length > 0;
      const larguraTexto = temFoto ? larguraInterna - fotoColW - 6.3 : larguraInterna;
      const desc = a.descricao ? linhas(a.descricao, larguraTexto, 9.75) : [];
      const alturaTexto = 3.1 + 7 + 7.2 + 1.8 + (desc.length ? 7 + (desc.length - 1) * 5 : 0);
      // Até 3 fotos extras ficam embaixo da principal; o resto, em linhas de 4 no fim do cartão.
      const mini = a.fotos.slice(1, 4);
      const resto = a.fotos.slice(4);
      const alturaFotos = temFoto ? principalH + (mini.length ? vaoMini + miniH : 0) : 0;
      const alturaTopo = pad + Math.max(alturaTexto, alturaFotos) + pad;
      const linhasResto = Math.ceil(resto.length / 4);
      return {
        temFoto, larguraTexto, desc, mini, resto, alturaTopo, linhasResto,
        alturaTotal: alturaTopo + linhasResto * (celH + vaoMini),
      };
    };
    const primeiro = medir(avarias[0]);
    const n = avarias.length;
    secao("Registro de avarias", primeiro.alturaTopo, `${n} ${n === 1 ? "registrada" : "registradas"}`);
    for (const [i, a] of avarias.entries()) {
      const { temFoto, larguraTexto, desc, mini, resto, alturaTopo, linhasResto } = medir(a);
      // Começa nesta página se a parte de cima do cartão (texto, foto principal e
      // miniaturas) couber; as linhas de fotos extras continuam na página seguinte.
      // Assim não sobra vão branco do tamanho do cartão inteiro.
      const vaoCartao = i > 0 ? 4.2 : 0;
      if (y + vaoCartao + alturaTopo > LIMITE) novaPagina(vaoCartao + alturaTopo, `avaria ${i + 1}`);
      else y += vaoCartao;

      const g = GRAVIDADES.find((x) => x.valor === a.gravidade) || GRAVIDADES[0];
      const corFaixa = rgb(g.cor);
      let inicioSegmento = y;
      const fecharSegmento = (fim) => {
        const h = fim - inicioSegmento;
        recortar(M, inicioSegmento, LARG, h, raio, () => {
          doc.setFillColor(...corFaixa);
          doc.rect(M, inicioSegmento, faixa, h, "F");
        });
        faixas.push(corFaixa);
        doc.setDrawColor(...COR.linha);
        doc.setLineWidth(0.26);
        doc.roundedRect(M, inicioSegmento, LARG, h, raio, raio, "S");
      };

      let yy = y + pad + 3.1;
      fonte("normal", 8.25, COR.cinza);
      escrever(`Avaria ${i + 1}`, xTexto, yy);
      yy += 7;
      fonte("bold", 12, COR.texto);
      escrever(umaLinha(a.area, larguraTexto), xTexto, yy);
      yy += 7.2;
      fonte("normal", 10.5, COR.texto2);
      const tipo = umaLinha(a.tipo, larguraTexto - 24);
      escrever(tipo, xTexto, yy);
      selo(a.gravidade, xTexto + largura(tipo) + 2.1, yy, { fundo: rgb(g.cor), cor: rgb(g.texto) });
      if (desc.length) {
        yy += 7;
        fonte("normal", 9.75, COR.texto2);
        escrever(desc, xTexto, yy, { lineHeightFactor: 5 / (9.75 * 0.3528) });
      }
      if (temFoto) {
        const xFoto = M + LARG - pad - fotoColW;
        foto(await imagem(arquivoAvaria(a.fotos[0]), { proporcao: 4 / 3 }), xFoto, y + pad, fotoColW, principalH);
        const imgs = await Promise.all(mini.map((id) => imagem(arquivoAvaria(id), { proporcao: 4 / 3 })));
        imgs.forEach((img, k) => foto(img, xFoto + k * (miniW + vaoMini), y + pad + principalH + vaoMini, miniW, miniH, 1.6));
      }
      y += alturaTopo;

      for (let l = 0; l < linhasResto; l++) {
        if (y + celH + vaoMini > LIMITE) {
          fecharSegmento(y);
          novaPagina(celH + vaoMini, `fotos extras da avaria ${i + 1}`);
          inicioSegmento = y;
          y += 2 * pad - vaoMini; // a próxima linha de fotos começa a `pad` do topo
        }
        const ids = resto.slice(l * 4, l * 4 + 4);
        const imgs = await Promise.all(ids.map((id) => imagem(arquivoAvaria(id), { proporcao: 4 / 3 })));
        imgs.forEach((img, k) => foto(img, xTexto + k * (celW + vaoMini), y - pad + vaoMini, celW, celH, 1.6));
        y += celH + vaoMini;
      }
      fecharSegmento(y);
    }
  }

  // ---------- 6. Assinaturas ----------
  const vaoAss = 6.3;
  const caixaW = (LARG - vaoAss) / 2;
  const caixaH = 34;
  const areaAssW = 80;
  const areaAssH = 19;
  // Caixa cinza com a assinatura, o nome e a função. Mais alta que o normal
  // (ao lado das fotos do recebimento), o conteúdo fica centralizado.
  // A assinatura ocupa o alto da caixa; nome e função ficam presos embaixo.
  const assinatura = (img, nomePessoa, funcao, x, yy, w = caixaW, h = caixaH) => {
    caixa(x, yy, w, h, 3.2, COR.painel);
    const centro = x + w / 2;
    const baseNome = yy + h - 10.6;
    const areaW = Math.min(areaAssW, w - 8);
    const areaH = Math.min(areaAssH + 5, baseNome - 5 - (yy + 3.2));
    const p = encaixar(img, centro - areaW / 2, yy + 3.2, areaW, areaH);
    doc.addImage(img.dados, "PNG", p.x, p.y, p.w, p.h, undefined, "FAST");
    fonte("bold", 10.5, COR.texto);
    escrever(umaLinha(nomePessoa || "—", w - 6), centro, baseNome, { align: "center" });
    fonte("normal", 9, COR.cinza);
    escrever(umaLinha(funcao, w - 6), centro, baseNome + 5.2, { align: "center" });
  };
  secao("Assinaturas", caixaH);
  const assinaturas = [
    [await imagem(ARQUIVO.assVistoriador, { tipo: "PNG", lado: 900 }), v.vistoriadorNome, "Vistoriador"],
    [await imagem(ARQUIVO.assMotorista, { tipo: "PNG", lado: 900 }), v.motoristaNome, "Motorista do reboque"],
  ];
  assinaturas.forEach(([img, nomePessoa, funcao], i) => assinatura(img, nomePessoa, funcao, M + i * (caixaW + vaoAss), y));
  y += caixaH;

  // ---------- 6b. Recebimento na loja (só depois de recebido) ----------
  const rec = v.recebimento;
  if (rec) {
    const divergencia = rec.status === "divergencia";
    const desc = divergencia && rec.descricao ? linhas(`O que está diferente: ${rec.descricao}`, LARG, 10) : [];
    // Com fotos de divergência, a assinatura é a 1ª caixa da grade de fotos: fica
    // sempre junto do título da seção e nunca sobra sozinha numa página nova.
    const comFotos = divergencia && rec.fotos.length > 0;
    const vao = 4.2;
    const grade = (colunas) => {
      const celW = (LARG - (colunas - 1) * vao) / colunas;
      const celH = celW * 0.75;
      const linhasGrade = Math.ceil((rec.fotos.length + 1) / colunas);
      return { colunas, celW, celH, altura: linhasGrade * celH + (linhasGrade - 1) * vao };
    };
    secao("Recebimento na loja", 9.5 + desc.length * 5 + (comFotos ? grade(3).celH : caixaH), "",
      { texto: STATUS_RECEBIMENTO[rec.status], erro: divergencia });
    const dataRec = `Data/hora do recebimento: ${formatarDataHora(rec.recebidoEm)}`;
    fonte("normal", 9.75, COR.cinza);
    const larguraData = largura(dataRec);
    escrever(dataRec, M + LARG, y + 3.6, { align: "right" });
    fonte("normal", 10.5, COR.texto);
    escrever(umaLinha(`Recebido por ${rec.recebedorNome} — ${rec.loja}`, LARG - larguraData - 5), M, y + 3.6);
    y += 9.5;
    if (desc.length) {
      fonte("normal", 10, COR.texto2);
      escrever(desc, M, y + 1, { lineHeightFactor: 5 / (10 * 0.3528) });
      y += desc.length * 5 + 2;
    }
    const img = await imagem(arquivoAssinaturaReceb(rec), { tipo: "PNG", lado: 900 });
    if (comFotos) {
      // 3 por linha; se assim não couber no resto da página e 4 por linha couber,
      // usa 4 (fotos um pouco menores) para não levar uma foto sozinha à página seguinte.
      const tres = grade(3);
      const quatro = grade(4);
      const { colunas, celW, celH } = y + tres.altura > LIMITE && y + quatro.altura <= LIMITE ? quatro : tres;
      const itens = [null, ...rec.fotos]; // null = a caixa da assinatura
      const totalLinhas = Math.ceil(itens.length / colunas);
      for (let l = 0; l < totalLinhas; l++) {
        garantir(celH, "fotos do recebimento");
        const ids = itens.slice(l * colunas, l * colunas + colunas);
        const imgs = await Promise.all(ids.map((id) => (id ? imagem(arquivoReceb(id), { proporcao: 4 / 3 }) : null)));
        imgs.forEach((im, k) => {
          const x = M + k * (celW + vao);
          if (im) foto(im, x, y, celW, celH);
          else assinatura(img, rec.recebedorNome, "Recebido na loja", x, y, celW, celH);
        });
        y += celH + (l < totalLinhas - 1 ? vao : 0);
      }
    } else {
      assinatura(img, rec.recebedorNome, "Recebido na loja", M, y);
      y += caixaH;
    }
  }

  // ---------- 7. Rodapé em todas as páginas ----------
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    linha(M, 283, M + LARG, 283);
    fonte("normal", 7.5, COR.cinza);
    escrever(`${EMPRESA.rodape} | ${identificacao} | Chassi ${v.chassi}`, M, 287.4);
    escrever(`Página ${p} de ${total}`, M + LARG, 287.4, { align: "right" });
  }

  const blob = doc.output("blob");
  const resultado = { blob, nomeArquivo: nomeArquivoPdf(v), paginas: total };
  if (depurar) {
    resultado.textos = textos;
    resultado.posicoes = posicoes;
    resultado.selos = selos;
    resultado.faixas = faixas;
    resultado.quebras = quebras;
    resultado.fimUltimaPagina = y;
    resultado.familias = Object.keys(doc.getFontList());
    resultado.fonteTitulo = TXT;
  }
  return resultado;
}
