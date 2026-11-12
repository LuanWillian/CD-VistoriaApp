// Laudo de vistoria em PDF (A4), gerado no próprio aparelho com jsPDF e
// jspdf-autotable (arquivos locais em vendor/, carregados só quando necessário).
// Visual: "Vistoria de veículo para expedição do CD" — cabeçalho com a empresa,
// seções com título e linha preta, dados em grade de 3 colunas, checklist em
// 2 colunas (OK / selo "Ausente"), registro fotográfico, cartões de avaria e
// assinaturas; rodapé com empresa, número, chassi e página.
import { CHECKLIST_ITENS, EMPRESA, FOTOS_VEICULO, GRAVIDADES, PDF_FOTO } from "./config.js";
import {
  ARQUIVO, arquivoAvaria, arquivoReceb, formatarDataHora, formatarKm, formatarMarca, nomeArquivoPdf, nomeVistoria, textoPdf,
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

// Fontes do modelo de laudo (arquivos locais em vendor/fontes, guardados offline
// pelo service worker): Barlow no texto e Barlow Semi Condensed ("BarlowSC")
// nos títulos. Se não carregarem, o laudo sai em Helvetica.
const FONTES = [
  ["Barlow", "normal", "Barlow-Regular.ttf"],
  ["Barlow", "bold", "Barlow-Bold.ttf"],
  ["BarlowSC", "bold", "BarlowSemiCondensed-Bold.ttf"],
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
const PAG_L = 210;
const PAG_A = 297;
const M = 18;
const LARG = PAG_L - 2 * M;
const LIMITE = 272; // abaixo disso fica o rodapé
const COR = {
  preto: [17, 17, 17],
  texto: [17, 17, 17],
  texto2: [102, 102, 102],
  apagado: [128, 128, 128],
  linhaClara: [204, 204, 204],
  borda: [200, 200, 200],
  rotulo: [110, 110, 110],
  linhaDados: [205, 205, 205],
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
  const TXT = fontes ? "Barlow" : "helvetica";
  const TIT = fontes ? "BarlowSC" : "helvetica";
  const textos = [];
  const posicoes = [];
  const selos = [];
  const avarias = v.semAvarias ? [] : v.avarias || [];
  const totalFotos = 3 + avarias.reduce((n, a) => n + a.fotos.length, 0);
  const maxLado = totalFotos > PDF_FOTO.limiteMuitas ? PDF_FOTO.maxLadoMuitas : PDF_FOTO.maxLado;
  const identificacao = v.numero || `${nomeVistoria(v)} (aguardando sincronização)`;
  const quando = formatarDataHora(v.realizadaEm);

  const imagem = async (arquivo, { tipo = "JPEG", lado = maxLado, proporcao = null } = {}) => {
    const blob = await obterImagem(arquivo);
    if (!blob) throw new ImagemAusenteError();
    return prepararImagem(blob, lado, tipo, proporcao);
  };

  // ---------- Ajudantes de desenho ----------
  let y = M;
  const fonte = (estilo, tamanho, cor = COR.texto, familia = TXT) => {
    doc.setFont(familia, estilo);
    doc.setFontSize(tamanho);
    doc.setTextColor(...cor);
  };
  const escrever = (texto, x, yy, opcoes) => {
    const t = Array.isArray(texto) ? texto : textoPdf(texto);
    doc.text(t, x, yy, opcoes);
    const lista = Array.isArray(t) ? t : [t];
    textos.push(...lista);
    if (depurar) {
      const pagina = doc.getCurrentPageInfo().pageNumber;
      lista.forEach((item) => posicoes.push({ texto: item, pagina }));
    }
  };
  const largura = (texto) => doc.getTextWidth(textoPdf(texto));
  const umaLinha = (texto, larguraMax) => doc.splitTextToSize(textoPdf(String(texto ?? "")), larguraMax)[0] || "—";
  const linhas = (texto, larguraMax, tamanho) => {
    fonte("normal", tamanho);
    return doc.splitTextToSize(textoPdf(texto), larguraMax);
  };
  const novaPagina = () => {
    doc.addPage();
    y = M + 4;
  };
  const garantir = (altura) => {
    if (y + altura > LIMITE) novaPagina();
  };
  const linha = (x1, y1, x2, y2, cor, espessura, tracejado = false) => {
    doc.setDrawColor(...cor);
    doc.setLineWidth(espessura);
    if (tracejado) doc.setLineDashPattern([0.5, 0.8], 0);
    doc.line(x1, y1, x2, y2);
    if (tracejado) doc.setLineDashPattern([], 0);
  };
  const titulo = (tamanho, cor = COR.preto) => fonte("bold", tamanho, cor, TIT);
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  // Selo arredondado: preto com texto branco ("Ausente") ou na cor da gravidade.
  const selo = (texto, x, yBase, { alinhar = "esquerda", fundo = COR.preto, cor = [255, 255, 255] } = {}) => {
    fonte("bold", 9, cor);
    const w = largura(texto) + 6;
    const x0 = alinhar === "direita" ? x - w : x;
    selos.push({ texto, fundo });
    doc.setFillColor(...fundo);
    doc.roundedRect(x0, yBase - 3.9, w, 5.6, 2.8, 2.8, "F");
    escrever(texto, x0 + 3, yBase);
    return w;
  };
  // Título da seção à esquerda, informação opcional à direita e linha preta.
  const secao = (nomeSecao, alturaMinimaConteudo, direita = "") => {
    garantir(13 + alturaMinimaConteudo);
    y += 6;
    titulo(15);
    escrever(nomeSecao, M, y);
    if (direita) {
      fonte("normal", 10, COR.texto2);
      escrever(direita, M + LARG, y, { align: "right" });
    }
    linha(M, y + 2.6, M + LARG, y + 2.6, COR.preto, 0.45);
    y += 10;
  };

  // ---------- 1. Cabeçalho ----------
  y = M + 4;
  titulo(22);
  escrever("Vistoria de veículo para expedição do CD", PAG_L / 2, y, { align: "center" });
  y += 9;
  // Empresa | endereço à esquerda e "Data/hora" à direita, na mesma linha:
  // diminui a letra até tudo caber sem encostar (mínimo 7,5 pt).
  const endereco = `| ${EMPRESA.endereco}`;
  const medirLinha = (t) => {
    fonte("bold", t);
    const negrito = largura(EMPRESA.nome) + 1.4 + largura("Data/hora");
    fonte("normal", t);
    return negrito + largura(endereco) + largura(quando) + 3 + 6;
  };
  let tamanhoLinha = 10.5;
  while (tamanhoLinha > 7.5 && medirLinha(tamanhoLinha) > LARG) tamanhoLinha -= 0.25;
  fonte("bold", tamanhoLinha, COR.texto);
  escrever(EMPRESA.nome, M, y);
  const xEndereco = M + largura(EMPRESA.nome) + 1.4; // espaço antes da barra, como no modelo
  fonte("normal", tamanhoLinha, COR.texto2);
  escrever(endereco, xEndereco, y);
  const larguraData = largura(quando);
  escrever(quando, M + LARG, y, { align: "right" });
  fonte("bold", tamanhoLinha, COR.texto);
  escrever("Data/hora", M + LARG - larguraData - 3, y, { align: "right" });
  y += 4;
  linha(M, y, M + LARG, y, COR.preto, 1);
  y += 2;

  // ---------- 2. Dados do veículo ----------
  // Ordem pedida: Chassi, Marca, Modelo / Cor, Quilometragem (km), Combustível.
  secao("Dados do veículo", v.loja ? 47 : 32);
  const dados = [
    ["Chassi", v.chassi, true], ["Marca", formatarMarca(v.marca ?? "")], ["Modelo", v.modelo],
    ["Cor", v.cor], ["Quilometragem (km)", formatarKm(v.km)], ["Combustível", v.combustivel],
  ];
  // Loja de destino numa 3ª linha, na largura toda (nomes longos não cortam).
  // Vistorias antigas não têm loja: a linha não aparece.
  if (v.loja) dados.push(["Loja de destino", v.loja, false, true]);
  const linhasDados = Math.ceil(dados.length / 3);
  const vao = 8;
  const colW = (LARG - 2 * vao) / 3;
  dados.forEach(([rotulo, valor, destaque, larga], i) => {
    const x = M + (i % 3) * (colW + vao);
    const w = larga ? LARG : colW;
    const yy = y + Math.floor(i / 3) * 15;
    // Igual ao modelo: rótulo Barlow 8,5 cinza; valor Barlow SemiBold 11,5;
    // chassi em Barlow Semi Condensed 12; linha fina 9 mm abaixo.
    fonte("normal", 8.5, COR.rotulo);
    escrever(rotulo, x, yy);
    if (destaque) titulo(12, COR.texto);
    else fonte("bold", 11.5, COR.texto);
    escrever(umaLinha(valor || "—", w), x, yy + 6);
    linha(x, yy + 9, x + w, yy + 9, COR.linhaDados, 0.25);
  });
  y += 30 + (linhasDados - 2) * 15;

  // ---------- 3. Checklist de equipamentos ----------
  const itens = [...CHECKLIST_ITENS, ...Object.keys(v.checklist || {}).filter((i) => !CHECKLIST_ITENS.includes(i))];
  const estado = (item) => v.checklist?.[item];
  // Presentes primeiro, depois ausentes (na ordem do checklist), em 2 colunas linha a linha.
  const ordenados = [...itens.filter((i) => estado(i) === "presente"), ...itens.filter((i) => estado(i) !== "presente")];
  const presentes = itens.filter((i) => estado(i) === "presente").length;
  const vaoColunas = 12;
  const colChk = (LARG - vaoColunas) / 2;
  const alturaItem = 8.2;
  const linhasChk = Math.ceil(ordenados.length / 2);
  secao("Checklist de equipamentos", Math.min(linhasChk, 3) * alturaItem, `${presentes} de ${itens.length} presentes`);
  for (let l = 0; l < linhasChk; l++) {
    garantir(alturaItem);
    for (let c = 0; c < 2; c++) {
      const item = ordenados[l * 2 + c];
      if (!item) continue;
      const x = M + c * (colChk + vaoColunas);
      const yBase = y + 4.6;
      const ausente = estado(item) !== "presente";
      fonte("normal", 11, ausente ? COR.apagado : COR.texto);
      escrever(umaLinha(item, colChk - 26), x, yBase);
      if (estado(item) === "presente") {
        fonte("bold", 11, COR.texto);
        escrever("OK", x + colChk, yBase, { align: "right" });
      } else if (estado(item) === "ausente") {
        selo("Ausente", x + colChk, yBase, { alinhar: "direita" });
      } else {
        fonte("normal", 11, COR.apagado);
        escrever("—", x + colChk, yBase, { align: "right" });
      }
      linha(x, y + alturaItem - 0.6, x + colChk, y + alturaItem - 0.6, COR.linhaClara, 0.3, true);
    }
    y += alturaItem;
  }
  if (v.checklistObs) {
    const obs = linhas(`Observação: ${v.checklistObs}`, LARG, 10);
    garantir(obs.length * 4.8 + 4);
    fonte("normal", 10, COR.texto2);
    escrever(obs, M, y + 5);
    y += obs.length * 4.8 + 3;
  }
  y += 4;

  // ---------- 4. Registro fotográfico ----------
  const vaoFoto = 6;
  const fotoW = (LARG - 2 * vaoFoto) / 3;
  const fotoH = fotoW * 0.75;
  secao("Registro fotográfico", fotoH + 9);
  const fotosVeiculo = await Promise.all(FOTOS_VEICULO.map((f) => imagem(ARQUIVO[f.chave], { proporcao: 4 / 3 })));
  FOTOS_VEICULO.forEach((f, i) => {
    const x = M + i * (fotoW + vaoFoto);
    doc.addImage(fotosVeiculo[i].dados, "JPEG", x, y, fotoW, fotoH, undefined, "FAST");
    fonte("normal", 10.5, COR.texto2);
    escrever(f.rotulo, x, y + fotoH + 5.5);
  });
  y += fotoH + 10;

  // ---------- 5. Registro de avarias ----------
  if (!avarias.length) {
    secao("Registro de avarias", 10);
    fonte("normal", 11, COR.texto2);
    escrever("Veículo sem avarias registradas.", M, y + 2);
    y += 8;
  } else {
    const faixa = 3;
    const pad = 6;
    const xTexto = M + faixa + pad;
    const larguraInterna = LARG - faixa - 2 * pad;
    const fotoAvW = 62;
    const fotoAvH = fotoAvW * 0.75;
    const vaoCel = 4;
    const celW = (larguraInterna - 2 * vaoCel) / 3;
    const celH = celW * 0.75;
    const medir = (a) => {
      const temFoto = a.fotos.length > 0;
      const larguraTexto = temFoto ? larguraInterna - fotoAvW - pad : larguraInterna;
      const desc = a.descricao ? linhas(a.descricao, larguraTexto, 10) : [];
      const alturaTexto = 4 + 7 + 7 + (desc.length ? 2 + desc.length * 4.6 : 0);
      const alturaTopo = pad + Math.max(alturaTexto, temFoto ? fotoAvH : 0) + pad;
      const extras = a.fotos.slice(1);
      const linhasExtras = Math.ceil(extras.length / 3);
      return { temFoto, larguraTexto, desc, alturaTopo, extras, linhasExtras, alturaTotal: alturaTopo + linhasExtras * (celH + vaoCel) };
    };
    const primeiro = medir(avarias[0]);
    const n = avarias.length;
    secao("Registro de avarias", primeiro.alturaTopo + 4, `${n} ${n === 1 ? "registrada" : "registradas"}`);
    for (const [i, a] of avarias.entries()) {
      const { temFoto, larguraTexto, desc, alturaTopo, extras, linhasExtras, alturaTotal } = medir(a);
      // Cartão inteiro na próxima página se não couber (e se couber numa página).
      if (alturaTotal <= LIMITE - M - 4) garantir(alturaTotal + 4);
      else garantir(alturaTopo + 4);

      let inicioSegmento = y;
      const fecharSegmento = (fim) => {
        doc.setDrawColor(...COR.borda);
        doc.setLineWidth(0.3);
        doc.rect(M, inicioSegmento, LARG, fim - inicioSegmento);
        doc.setFillColor(...COR.preto);
        doc.rect(M, inicioSegmento, faixa, fim - inicioSegmento, "F");
      };

      let yy = y + pad + 3.5;
      fonte("normal", 9.5, COR.texto2);
      escrever(`Avaria ${i + 1}`, xTexto, yy);
      yy += 7;
      titulo(15, COR.texto);
      escrever(umaLinha(a.area, larguraTexto), xTexto, yy);
      yy += 7;
      fonte("normal", 11, COR.texto2);
      const tipo = umaLinha(a.tipo, larguraTexto - 30);
      escrever(tipo, xTexto, yy);
      const g = GRAVIDADES.find((x) => x.valor === a.gravidade) || GRAVIDADES[0];
      selo(a.gravidade, xTexto + largura(tipo) + 4, yy, { fundo: rgb(g.cor), cor: rgb(g.texto) });
      if (desc.length) {
        yy += 6.6;
        fonte("normal", 10, COR.texto);
        escrever(desc, xTexto, yy);
      }
      if (temFoto) {
        const principal = await imagem(arquivoAvaria(a.fotos[0]), { proporcao: 4 / 3 });
        doc.addImage(principal.dados, "JPEG", M + LARG - pad - fotoAvW, y + pad, fotoAvW, fotoAvH, undefined, "FAST");
      }
      y += alturaTopo;

      for (let l = 0; l < linhasExtras; l++) {
        if (y + celH + vaoCel > LIMITE) {
          fecharSegmento(y);
          novaPagina();
          inicioSegmento = y;
          y += pad;
        }
        const ids = extras.slice(l * 3, l * 3 + 3);
        const imgs = await Promise.all(ids.map((id) => imagem(arquivoAvaria(id), { proporcao: 4 / 3 })));
        imgs.forEach((img, k) => {
          doc.addImage(img.dados, "JPEG", xTexto + k * (celW + vaoCel), y, celW, celH, undefined, "FAST");
        });
        y += celH + vaoCel;
      }
      if (linhasExtras) y += pad - vaoCel;
      fecharSegmento(y);
      y += 6;
    }
  }

  // ---------- 6. Assinaturas ----------
  secao("Assinaturas", 48);
  const assinaturas = [
    [await imagem(ARQUIVO.assVistoriador, { tipo: "PNG", lado: 900 }), v.vistoriadorNome, "Vistoriador"],
    [await imagem(ARQUIVO.assMotorista, { tipo: "PNG", lado: 900 }), v.motoristaNome, "Motorista do reboque"],
  ];
  const caixaW = 70;
  const caixaH = 26;
  y += 4;
  assinaturas.forEach(([img, nomePessoa, funcao], i) => {
    const centro = M + LARG / 4 + i * (LARG / 2);
    const p = encaixar(img, centro - caixaW / 2, y, caixaW, caixaH);
    doc.addImage(img.dados, "PNG", p.x, p.y, p.w, p.h, undefined, "FAST");
    linha(centro - 36, y + caixaH + 2, centro + 36, y + caixaH + 2, COR.preto, 0.4);
    fonte("bold", 11.5, COR.texto);
    escrever(umaLinha(nomePessoa || "—", 72), centro, y + caixaH + 8, { align: "center" });
    fonte("normal", 10, COR.texto2);
    escrever(funcao, centro, y + caixaH + 13, { align: "center" });
  });
  y += caixaH + 18;

  // ---------- 6b. Recebimento na loja (só depois de recebido) ----------
  const rec = v.recebimento;
  if (rec) {
    const divergencia = rec.status === "divergencia";
    const desc = divergencia && rec.descricao ? linhas(`O que está diferente: ${rec.descricao}`, LARG, 10.5) : [];
    secao("Recebimento na loja", 30 + desc.length * 4.8, STATUS_RECEBIMENTO[rec.status]);
    fonte("bold", 11.5, COR.texto);
    escrever(umaLinha(`Recebido por ${rec.recebedorNome} — ${rec.loja}`, LARG - 45), M, y + 4);
    selo(STATUS_RECEBIMENTO[rec.status], M + LARG, y + 4, {
      alinhar: "direita", fundo: divergencia ? rgb("#F28C28") : rgb("#1B7F3B"), cor: divergencia ? rgb("#1A1A1A") : [255, 255, 255],
    });
    fonte("normal", 10, COR.texto2);
    escrever(`Data/hora do recebimento: ${formatarDataHora(rec.recebidoEm)}`, M, y + 10);
    y += 16;
    if (desc.length) {
      fonte("normal", 10.5, COR.texto);
      escrever(desc, M, y);
      y += desc.length * 4.8 + 2;
    }
    if (divergencia && rec.fotos.length) {
      const vao = 4;
      const celW = (LARG - 2 * vao) / 3;
      const celH = celW * 0.75;
      for (let l = 0; l < Math.ceil(rec.fotos.length / 3); l++) {
        garantir(celH + vao);
        const ids = rec.fotos.slice(l * 3, l * 3 + 3);
        const imgs = await Promise.all(ids.map((id) => imagem(arquivoReceb(id), { proporcao: 4 / 3 })));
        imgs.forEach((img, k) => doc.addImage(img.dados, "JPEG", M + k * (celW + vao), y, celW, celH, undefined, "FAST"));
        y += celH + vao;
      }
    }
    garantir(caixaH + 18);
    const img = await imagem(ARQUIVO.recebAssinatura, { tipo: "PNG", lado: 900 });
    const centro = M + LARG / 4;
    const p = encaixar(img, centro - caixaW / 2, y + 2, caixaW, caixaH);
    doc.addImage(img.dados, "PNG", p.x, p.y, p.w, p.h, undefined, "FAST");
    linha(centro - 36, y + caixaH + 4, centro + 36, y + caixaH + 4, COR.preto, 0.4);
    fonte("bold", 11.5, COR.texto);
    escrever(umaLinha(rec.recebedorNome || "—", 72), centro, y + caixaH + 10, { align: "center" });
    fonte("normal", 10, COR.texto2);
    escrever("Recebido na loja", centro, y + caixaH + 15, { align: "center" });
    y += caixaH + 20;
  }

  // ---------- 7. Rodapé em todas as páginas ----------
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    linha(M, 280, M + LARG, 280, COR.preto, 0.35);
    fonte("normal", 9, COR.texto2);
    escrever(`${EMPRESA.rodape} | ${identificacao} | Chassi ${v.chassi}`, M, 285.5);
    escrever(`Página ${p} de ${total}`, M + LARG, 285.5, { align: "right" });
  }

  const blob = doc.output("blob");
  const resultado = { blob, nomeArquivo: nomeArquivoPdf(v), paginas: total };
  if (depurar) {
    resultado.textos = textos;
    resultado.posicoes = posicoes;
    resultado.selos = selos;
    resultado.familias = Object.keys(doc.getFontList());
    resultado.fonteTitulo = TIT;
  }
  return resultado;
}
