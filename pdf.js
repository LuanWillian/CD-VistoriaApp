// Laudo de vistoria em PDF (A4), gerado no próprio aparelho com jsPDF e
// jspdf-autotable (arquivos locais em vendor/, carregados só quando necessário).
import { CHECKLIST_ITENS, FOTOS_VEICULO, GRAVIDADES, PDF_FOTO } from "./config.js";
import {
  ARQUIVO, arquivoAvaria, formatarDataHora, formatarKm, nomeArquivoPdf, nomeVistoria, textoPdf,
} from "./formatos.js";
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

// ---------- Medidas (mm) e cores ----------
const PAG_L = 210;
const PAG_A = 297;
const M = 15;
const LARG = PAG_L - 2 * M;
const LIMITE = 280;
const COR = {
  principal: [17, 17, 17],
  texto: [17, 17, 17],
  texto2: [80, 90, 98],
  linha: [205, 212, 218],
  ausenteFundo: [253, 236, 234],
  ausenteTexto: [179, 38, 30],
};
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// Reamostra a imagem para o PDF; JPEG para fotos, PNG para assinaturas (transparência).
async function prepararImagem(blob, maxLado, tipo = "JPEG") {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  const g = c.getContext("2d");
  if (tipo === "JPEG") {
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
  }
  g.drawImage(bmp, 0, 0, c.width, c.height);
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
    return await montarPdf(vistoria, obterImagem, depurar);
  } catch (e) {
    if (e instanceof ImagemAusenteError || e instanceof ErroPdf) throw e;
    throw new ErroPdf(e?.message || String(e));
  }
}

async function montarPdf(v, obterImagem, depurar) {
  const { jsPDF } = globalThis.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const textos = [];
  const posicoes = [];
  const avarias = v.semAvarias ? [] : v.avarias || [];
  const totalFotos = 3 + avarias.reduce((n, a) => n + a.fotos.length, 0);
  const maxLado = totalFotos > PDF_FOTO.limiteMuitas ? PDF_FOTO.maxLadoMuitas : PDF_FOTO.maxLado;
  const nome = nomeVistoria(v);
  const quando = formatarDataHora(v.realizadaEm);

  const imagem = async (arquivo, tipo = "JPEG", lado = maxLado) => {
    const blob = await obterImagem(arquivo);
    if (!blob) throw new ImagemAusenteError();
    return prepararImagem(blob, lado, tipo);
  };

  // ---------- Ajudantes de desenho ----------
  let y = M;
  const fonte = (estilo, tamanho, cor = COR.texto) => {
    doc.setFont("helvetica", estilo);
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
      lista.forEach((texto) => posicoes.push({ texto, pagina }));
    }
  };
  const novaPagina = () => {
    doc.addPage();
    y = M;
  };
  const garantir = (altura) => {
    if (y + altura > LIMITE) novaPagina();
  };
  const secao = (titulo, alturaMinimaConteudo) => {
    garantir(12 + alturaMinimaConteudo);
    y += 4;
    fonte("bold", 12.5, COR.principal);
    escrever(titulo, M, y);
    doc.setDrawColor(...COR.principal);
    doc.setLineWidth(0.4);
    doc.line(M, y + 1.8, M + LARG, y + 1.8);
    y += 8;
  };
  const linhas = (texto, largura, tamanho) => {
    fonte("normal", tamanho);
    return doc.splitTextToSize(textoPdf(texto), largura);
  };

  // ---------- 1. Cabeçalho ----------
  doc.setFillColor(...COR.principal);
  doc.rect(0, 0, PAG_L, 4, "F");
  y = 16;
  fonte("bold", 18, COR.principal);
  escrever("Laudo de Vistoria Veicular", M, y);
  y += 8;
  fonte("bold", 11);
  escrever(v.numero ? `Vistoria nº ${v.numero}` : `${nome} — aguardando sincronização`, M, y);
  fonte("normal", 10, COR.texto2);
  escrever(`Realizada em ${quando}`, M + LARG, y, { align: "right" });
  y += 4;
  doc.setDrawColor(...COR.linha);
  doc.setLineWidth(0.3);
  doc.line(M, y, M + LARG, y);
  y += 2;

  // ---------- 2. Dados do veículo ----------
  secao("Dados do veículo", 26);
  const dados = [
    ["Chassi", v.chassi], ["Marca", v.marca], ["Modelo", v.modelo],
    ["Cor", v.cor], ["Km", `${formatarKm(v.km)} km`], ["Combustível", v.combustivel],
  ];
  const colW = LARG / 3;
  dados.forEach(([rotulo, valor], i) => {
    const x = M + (i % 3) * colW;
    const yy = y + Math.floor(i / 3) * 13;
    fonte("normal", 8.5, COR.texto2);
    escrever(rotulo, x, yy);
    fonte("bold", 11.5);
    escrever(doc.splitTextToSize(textoPdf(String(valor ?? "—")), colW - 4)[0] || "—", x, yy + 5.5);
  });
  y += 26;

  // ---------- 3. Fotos do veículo ----------
  const fotoW = (LARG - 2 * 5) / 3;
  const fotoH = fotoW * 0.75;
  secao("Fotos do veículo", fotoH + 7);
  const fotosVeiculo = await Promise.all(FOTOS_VEICULO.map((f) => imagem(ARQUIVO[f.chave])));
  FOTOS_VEICULO.forEach((f, i) => {
    const x = M + i * (fotoW + 5);
    doc.setDrawColor(...COR.linha);
    doc.setLineWidth(0.2);
    doc.rect(x, y, fotoW, fotoH);
    const p = encaixar(fotosVeiculo[i], x, y, fotoW, fotoH);
    doc.addImage(fotosVeiculo[i].dados, "JPEG", p.x, p.y, p.w, p.h, undefined, "FAST");
    fonte("normal", 9, COR.texto2);
    escrever(f.rotulo, x + fotoW / 2, y + fotoH + 4.5, { align: "center" });
  });
  y += fotoH + 9;

  // ---------- 4. Checklist ----------
  const itens = [...CHECKLIST_ITENS, ...Object.keys(v.checklist || {}).filter((i) => !CHECKLIST_ITENS.includes(i))];
  const situacao = (item) => ({ presente: "Ok", ausente: "Ausente" })[v.checklist?.[item]] || "—";
  const metade = Math.ceil(itens.length / 2);
  const colunas = [itens.slice(0, metade), itens.slice(metade)];
  const alturaLinha = 6.6;
  secao("Checklist", (metade + 1) * alturaLinha);
  const inicioTabela = y;
  let fimTabela = y;
  const largTabela = (LARG - 6) / 2;
  colunas.forEach((grupo, i) => {
    if (!grupo.length) return;
    globalThis.autoTable(doc, {
      startY: inicioTabela,
      margin: { left: M + i * (largTabela + 6), right: PAG_L - (M + i * (largTabela + 6) + largTabela), top: M, bottom: PAG_A - LIMITE },
      tableWidth: largTabela,
      head: [["Item", "Situação"]],
      body: grupo.map((item) => [textoPdf(item), situacao(item)]),
      theme: "grid",
      rowPageBreak: "avoid",
      styles: { font: "helvetica", fontSize: 9.5, cellPadding: 1.6, textColor: COR.texto, lineColor: COR.linha, lineWidth: 0.2 },
      headStyles: { fillColor: COR.principal, textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: { 1: { cellWidth: 26, halign: "center" } },
      didParseCell: (d) => {
        if (d.section === "body" && d.column.index === 1 && d.cell.raw === "Ausente") {
          d.cell.styles.fillColor = COR.ausenteFundo;
          d.cell.styles.textColor = COR.ausenteTexto;
          d.cell.styles.fontStyle = "bold";
        }
      },
    });
    textos.push(...grupo);
    fimTabela = Math.max(fimTabela, doc.lastAutoTable.finalY);
  });
  y = fimTabela + 4;
  if (v.checklistObs) {
    const obs = linhas(`Observação: ${v.checklistObs}`, LARG, 9.5);
    garantir(obs.length * 4.6);
    fonte("normal", 9.5);
    escrever(obs, M, y + 3);
    y += obs.length * 4.6 + 2;
  }

  // ---------- 5. Avarias ----------
  if (!avarias.length) {
    secao("Avarias", 10);
    fonte("normal", 10.5, COR.texto2);
    escrever("Veículo sem avarias registradas.", M, y + 2);
    y += 8;
  } else {
    const pad = 4;
    const faixa = 3;
    const internoX = M + faixa + pad;
    const internoW = LARG - faixa - 2 * pad;
    const celW = (internoW - 2 * 4) / 3;
    const celH = celW * 0.75;
    const medir = (a) => {
      const desc = a.descricao ? linhas(a.descricao, internoW, 9.5) : [];
      const alturaTopo = pad + 4 + 6 + 7 + desc.length * 4.4 + 2;
      const linhasFotos = Math.ceil(a.fotos.length / 3);
      return { desc, alturaTopo, linhasFotos, alturaTotal: alturaTopo + linhasFotos * (celH + 4) + pad };
    };
    // O título só fica na página se o primeiro cartão (ou o começo dele) couber junto.
    const primeiro = medir(avarias[0]);
    secao(`Avarias (${avarias.length})`, Math.min(primeiro.alturaTotal, primeiro.alturaTopo + celH + 8) + 4);
    for (const [i, a] of avarias.entries()) {
      const g = GRAVIDADES.find((x) => x.valor === a.gravidade) || GRAVIDADES[0];
      const { desc, alturaTopo, linhasFotos, alturaTotal } = medir(a);
      // Cartão inteiro na próxima página se não couber (e se couber numa página).
      if (alturaTotal <= LIMITE - M) garantir(alturaTotal + 4);
      else garantir(alturaTopo + celH + 8);

      let inicioSegmento = y;
      const fecharSegmento = (fim) => {
        doc.setDrawColor(...COR.linha);
        doc.setLineWidth(0.3);
        doc.rect(M, inicioSegmento, LARG, fim - inicioSegmento);
        doc.setFillColor(...rgb(g.cor));
        doc.rect(M, inicioSegmento, faixa, fim - inicioSegmento, "F");
      };

      let yy = y + pad + 3;
      fonte("normal", 8.5, COR.texto2);
      escrever(`Avaria ${i + 1}`, internoX, yy);
      yy += 6;
      fonte("bold", 12);
      escrever(doc.splitTextToSize(textoPdf(`${a.area} — ${a.tipo}`), internoW)[0], internoX, yy);
      yy += 6.5;
      // selo colorido da gravidade
      fonte("bold", 9, rgb(g.texto));
      const larguraSelo = doc.getTextWidth(a.gravidade) + 6;
      doc.setFillColor(...rgb(g.cor));
      doc.roundedRect(internoX, yy - 4, larguraSelo, 5.6, 2.8, 2.8, "F");
      escrever(a.gravidade, internoX + 3, yy);
      fonte("normal", 9, COR.texto2);
      escrever(a.fotos.length ? `${a.fotos.length} ${a.fotos.length === 1 ? "foto" : "fotos"}` : "sem foto", internoX + larguraSelo + 3, yy);
      yy += 6;
      if (desc.length) {
        fonte("normal", 9.5);
        escrever(desc, internoX, yy);
        yy += desc.length * 4.4;
      }
      y = yy + 1;

      for (let l = 0; l < linhasFotos; l++) {
        if (y + celH + 4 > LIMITE) {
          fecharSegmento(y);
          novaPagina();
          inicioSegmento = y;
          y += pad;
        }
        const ids = a.fotos.slice(l * 3, l * 3 + 3);
        const imgs = await Promise.all(ids.map((id) => imagem(arquivoAvaria(id))));
        imgs.forEach((img, k) => {
          const x = internoX + k * (celW + 4);
          doc.setDrawColor(...COR.linha);
          doc.setLineWidth(0.2);
          doc.rect(x, y, celW, celH);
          const p = encaixar(img, x, y, celW, celH);
          doc.addImage(img.dados, "JPEG", p.x, p.y, p.w, p.h, undefined, "FAST");
        });
        y += celH + 4;
      }
      y += pad - 2;
      fecharSegmento(y);
      y += 5;
    }
  }

  // ---------- 6. Assinaturas ----------
  secao("Assinaturas", 46);
  const assinaturas = [
    [await imagem(ARQUIVO.assVistoriador, "PNG", 900), v.vistoriadorNome, "Vistoriador"],
    [await imagem(ARQUIVO.assMotorista, "PNG", 900), v.motoristaNome, "Motorista do reboque"],
  ];
  const caixaW = 72;
  const caixaH = 26;
  assinaturas.forEach(([img, nomePessoa, funcao], i) => {
    const centro = M + LARG / 4 + i * (LARG / 2);
    const p = encaixar(img, centro - caixaW / 2, y, caixaW, caixaH);
    doc.addImage(img.dados, "PNG", p.x, p.y, p.w, p.h, undefined, "FAST");
    doc.setDrawColor(...COR.texto);
    doc.setLineWidth(0.35);
    doc.line(centro - caixaW / 2, y + caixaH + 1, centro + caixaW / 2, y + caixaH + 1);
    fonte("bold", 10.5);
    escrever(doc.splitTextToSize(textoPdf(nomePessoa), caixaW)[0] || "—", centro, y + caixaH + 6, { align: "center" });
    fonte("normal", 9, COR.texto2);
    escrever(funcao, centro, y + caixaH + 10.5, { align: "center" });
    escrever(quando, centro, y + caixaH + 15, { align: "center" });
  });
  y += caixaH + 18;

  // ---------- 7. Rodapé em todas as páginas ----------
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(...COR.linha);
    doc.setLineWidth(0.2);
    doc.line(M, 285, M + LARG, 285);
    fonte("normal", 8.5, COR.texto2);
    escrever(`Vistoria nº ${nome} — página ${p} de ${total}`, PAG_L / 2, 290, { align: "center" });
  }

  const blob = doc.output("blob");
  const resultado = { blob, nomeArquivo: nomeArquivoPdf(v), paginas: total };
  if (depurar) {
    resultado.textos = textos;
    resultado.posicoes = posicoes;
  }
  return resultado;
}
