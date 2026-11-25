import { teste, igual, ok, rejeita } from "./runner.js";
import { gerarPdf, ImagemAusenteError } from "../../pdf.js";
import { CHECKLIST_ITENS } from "../../config.js";

function foto(semente, largura = 1280, altura = 960) {
  const c = document.createElement("canvas");
  c.width = largura;
  c.height = altura;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, largura, altura);
  grad.addColorStop(0, `hsl(${semente * 37 % 360} 60% 45%)`);
  grad.addColorStop(1, `hsl(${(semente * 37 + 120) % 360} 50% 70%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, largura, altura);
  for (let i = 0; i < 180; i++) {
    g.fillStyle = `hsla(${(i * 47 + semente * 13) % 360} 70% 50% / 0.5)`;
    g.beginPath();
    g.arc((i * 97 + semente * 31) % largura, (i * 53 + semente * 17) % altura, 10 + (i % 40), 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#fff";
  g.font = "bold 90px sans-serif";
  g.fillText(`FOTO ${semente}`, 80, 160);
  return new Promise((r) => c.toBlob(r, "image/jpeg", 0.7));
}

function assinatura() {
  const c = document.createElement("canvas");
  c.width = 600;
  c.height = 300;
  const g = c.getContext("2d");
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(40, 200);
  for (let i = 1; i < 20; i++) g.lineTo(40 + i * 27, 200 - Math.sin(i) * 80);
  g.stroke();
  return new Promise((r) => c.toBlob(r, "image/png"));
}

async function cenario({ avarias = 10, fotosPorAvaria = 3, numero = null, semAvarias = false } = {}) {
  const arquivos = new Map();
  let n = 0;
  for (const nome of ["frente.jpg", "traseira.jpg", "chassi.jpg"]) arquivos.set(nome, await foto(++n));
  arquivos.set("assinatura_vistoriador.png", await assinatura());
  arquivos.set("assinatura_motorista.png", await assinatura());
  const lista = [];
  for (let i = 0; i < avarias; i++) {
    const fotos = [];
    for (let j = 0; j < fotosPorAvaria; j++) {
      const id = `f${i}-${j}`;
      fotos.push(id);
      arquivos.set(`avaria_${id}.jpg`, await foto(++n));
    }
    lista.push({
      id: `d${i}`, area: i % 2 ? "Porta dianteira esquerda" : "Para-choque traseiro", tipo: "Amassado",
      gravidade: ["Leve", "Moderada", "Grave"][i % 3],
      descricao: i === 0 ? `Risco 👍 na porta ${"muito longo ".repeat(60)}` : "Amassado leve perto do farol",
      fotos,
    });
  }
  const v = {
    id: "8f3a1c2e-0000-4000-8000-000000000000", userId: "u1", numero, realizadaEm: new Date(2026, 10, 7, 15, 30).toISOString(),
    loja: "PG Prime Selection João Pessoa", chassi: "AB123C", marca: "Volkswagen", modelo: "Gol", cor: "Prata", km: 123456, combustivel: "Flex",
    checklist: Object.fromEntries(CHECKLIST_ITENS.map((item, i) => [item, i % 4 ? "presente" : "ausente"])),
    checklistObs: "Estepe sem calota.", semAvarias, avarias: semAvarias ? [] : lista,
    vistoriadorNome: "Ana Lima", motoristaNome: "José 🚚",
  };
  return { v, obter: async (nome) => arquivos.get(nome) ?? null };
}

teste("pdf: laudo com 33 fotos fica abaixo de 10 MB e aceita emoji", async () => {
  const { v, obter } = await cenario();
  const r = await gerarPdf(v, obter);
  igual(r.nomeArquivo, "Vistoria_AB123C_07-11-2026.pdf");
  igual(r.blob.type, "application/pdf");
  ok(r.blob.size < 10 * 1024 * 1024, `PDF com ${r.blob.size} bytes`);
  ok(r.paginas >= 4, `só ${r.paginas} páginas`);
  window.ultimoPdf = URL.createObjectURL(r.blob);
  window.tamanhoPdf = r.blob.size;
});

teste("pdf: sem avarias, número provisório e rodapé", async () => {
  const { v, obter } = await cenario({ semAvarias: true });
  const r = await gerarPdf(v, obter, { depurar: true });
  ok(r.paginas >= 1);
  for (const t of ["Vistoria de expedição do CD", "Veículo sem avarias registradas",
    "PrimeCheck | Provisório 8F3A (aguardando sincronização) | Chassi AB123C", `Página ${r.paginas} de ${r.paginas}`]) {
    ok(r.textos.some((x) => x.includes(t)), `faltou o texto: ${t}`);
  }
});

teste("pdf: número oficial no rodapé", async () => {
  const { v, obter } = await cenario({ avarias: 1, fotosPorAvaria: 1, numero: "VIS-000123" });
  const r = await gerarPdf(v, obter, { depurar: true });
  ok(r.textos.includes("PrimeCheck | VIS-000123 | Chassi AB123C"), "rodapé com número oficial ausente");
  ok(r.textos.includes(`Página 1 de ${r.paginas}`), "numeração de página ausente");
});

teste("pdf: imagem que não está no aparelho", async () => {
  const { v, obter } = await cenario({ avarias: 0 });
  const e = await rejeita(gerarPdf(v, async (nome) => (nome === "traseira.jpg" ? null : obter(nome))));
  ok(e instanceof ImagemAusenteError, "erro não é ImagemAusenteError");
  igual(e.message, "Algumas fotos ainda não estão neste aparelho. Conecte-se à internet para gerar o PDF.");
});

teste("pdf: o título da seção Avarias fica na mesma página da primeira avaria", async () => {
  const { v, obter } = await cenario({ avarias: 4, fotosPorAvaria: 2 });
  v.checklistObs = "Estepe sem calota; tapete traseiro rasgado.";
  const r = await gerarPdf(v, obter, { depurar: true });
  const pagina = (texto) => r.posicoes.find((p) => p.texto.startsWith(texto))?.pagina;
  ok(pagina("REGISTRO DE AVARIAS"), "título de avarias ausente");
  igual(pagina("REGISTRO DE AVARIAS"), pagina("Avaria 1"));
});

teste("pdf: visual do app — cabeçalho, dados na ordem pedida, checklist e seções", async () => {
  const { v, obter } = await cenario({ avarias: 1, fotosPorAvaria: 2, numero: "VIS-000007" });
  const r = await gerarPdf(v, obter, { depurar: true });
  const t = r.textos;
  for (const x of ["PRIMECHECK", "Vistoria de expedição do CD", "PG Prime", "07/11/2026 15:30",
    "DADOS DO VEÍCULO", "CHECKLIST DE EQUIPAMENTOS", "REGISTRO FOTOGRÁFICO", "REGISTRO DE AVARIAS", "1 registrada", "ASSINATURAS"]) {
    ok(t.some((y) => y.includes(x)), `faltou: ${x}`);
  }
  // Grade: Chassi, Marca, Modelo / Cor, Quilometragem (km), Combustível
  const ordem = ["Chassi", "Marca", "Modelo", "Cor", "Quilometragem (km)", "Combustível"].map((x) => t.indexOf(x));
  ok(ordem.every((i) => i >= 0), `rótulos ausentes: ${ordem}`);
  igual([...ordem].sort((a, b) => a - b), ordem, "rótulos fora da ordem pedida");
  igual(t[ordem[4] + 1], "123.456", "km logo depois do rótulo, sem repetir 'km'");
  const presentes = CHECKLIST_ITENS.filter((_, i) => i % 4).length;
  ok(t.includes(`${presentes} de ${CHECKLIST_ITENS.length} presentes`), "contador do checklist ausente");
  ok(t.filter((x) => x === "OK").length === presentes && t.filter((x) => x === "Ausente").length === CHECKLIST_ITENS.length - presentes,
    "OK/Ausente não batem com o checklist");
  ok(!t.some((x) => x.includes("Laudo de Vistoria Veicular") || x.includes("Vistoria de veículo para expedição")), "título antigo ainda aparece");
  ok(!t.some((x) => x.includes("Data/hora") || x.startsWith("Checklist:") || x.startsWith("Avarias:")), "o topo não tem mais rótulo Data/hora nem resumo");
  igual(r.posicoes.filter((p) => p.pagina === 1 && p.texto.includes("VIS-000007")).length, 1,
    "na 1ª página o número só aparece no rodapé (sem número no topo)");
});

teste("pdf: fonte do app (Satoshi), gravidade colorida, selos com bolinha e rodapé PrimeCheck", async () => {
  const { v, obter } = await cenario({ avarias: 3, fotosPorAvaria: 1, numero: "VIS-000009" });
  const r = await gerarPdf(v, obter, { depurar: true });
  ok(r.familias.includes("Satoshi") && r.familias.includes("SatoshiM"), `fontes registradas: ${r.familias}`);
  igual(r.fonteTitulo, "Satoshi");
  ok(r.textos.includes("PrimeCheck | VIS-000009 | Chassi AB123C"), "rodapé deveria dizer PrimeCheck");
  ok(!r.textos.some((t) => t.includes("PG Prime Vistoria")), "ainda aparece PG Prime Vistoria");
  const cor = (nome) => r.selos.find((s) => s.texto === nome)?.fundo.join();
  const texto = (nome) => r.selos.find((s) => s.texto === nome)?.cor.join();
  igual(cor("Leve"), "245,196,0");
  igual(cor("Moderada"), "242,140,40");
  igual(cor("Grave"), "198,40,40");
  igual(texto("Ausente"), "179,38,30", "Ausente em vermelho, como no app");
  igual(cor("Ausente"), "253,236,234", "Ausente com fundo vermelho claro, como no app");
  igual(texto("OK"), "22,101,52", "OK em verde, como no app");
  igual(r.faixas.map((f) => f.join()), ["245,196,0", "242,140,40", "198,40,40"].slice(0, r.faixas.length), "faixa lateral na cor da gravidade");
  ok(r.faixas.length === 3, `uma faixa por avaria (veio ${r.faixas.length})`);
});

teste("pdf: seção Recebimento na loja só quando há recebimento, com divergência, fotos e assinatura", async () => {
  const sem = await cenario({ avarias: 0, numero: "VIS-000030" });
  const r0 = await gerarPdf(sem.v, sem.obter, { depurar: true });
  ok(!r0.textos.some((x) => x.toUpperCase().includes("RECEBIMENTO NA LOJA")), "sem recebimento não pode ter a seção");

  const { v, obter } = await cenario({ avarias: 1, fotosPorAvaria: 1, numero: "VIS-000031" });
  const extras = new Map([["receb_assinatura.png", await assinatura()], ["receb_f1.jpg", await foto(91)]]);
  v.recebimento = {
    id: "r1", userId: "uL", status: "divergencia", recebedorNome: "Davi Loja", loja: "PG Prime BMW Natal",
    recebidoEm: new Date(2026, 10, 12, 14, 5).toISOString(), descricao: "Risco novo na porta traseira direita",
    assinatura: "uL/v/receb_assinatura.png", fotos: ["f1"],
  };
  const r = await gerarPdf(v, async (nome) => extras.get(nome) ?? obter(nome), { depurar: true });
  for (const t of ["RECEBIMENTO NA LOJA", "Com divergência", "Recebido por Davi Loja — PG Prime BMW Natal", "12/11/2026 14:05",
    "Risco novo na porta traseira direita", "Recebido na loja"]) {
    ok(r.textos.some((x) => x.includes(t)), `faltou: ${t}`);
  }
  const pos = (texto) => r.textos.findIndex((x) => x.includes(texto));
  ok(pos("ASSINATURAS") < pos("RECEBIMENTO NA LOJA"), "a seção vem depois das Assinaturas");
  igual(r.selos.find((s) => s.texto === "Com divergência")?.cor.join(), "179,38,30", "Com divergência vermelho, como no app");
  ok(r.blob.size < 10 * 1024 * 1024);
});
