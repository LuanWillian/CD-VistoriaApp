// Exportação de listas para planilha (CSV aberto direto no Excel em pt-BR) e
// download de arquivos gerados no navegador (CSV, PDF).
import { formatarDataHora, formatarMarca, nomeVistoria } from "./formatos.js";
import { gravidadeMaxima, lojaDe } from "./dashboard-dados.js";
import { STATUS_RECEBIMENTO, situacaoRecebimento } from "./recebimento-dados.js";

const STATUS_VISTORIA = { sincronizada: "Sincronizada", pendente: "Pendente", erro: "Erro ao enviar" };

// Campo com ; " ou quebra de linha vai entre aspas (aspas internas dobradas).
// Texto que começa com = + - @ ganha um ' na frente: o Excel não roda como fórmula.
function campo(valor) {
  let s = String(valor ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// linhas: matriz (primeira linha = cabeçalho). Separador ";" e BOM UTF-8, como o
// Excel em português espera; quebra de linha CRLF.
export function gerarCsv(linhas) {
  return `﻿${linhas.map((l) => l.map(campo).join(";")).join("\r\n")}\r\n`;
}

// Quantidade de avarias: a lista do servidor traz só a contagem (avariasQtd).
export const qtdAvarias = (v) => v.avariasQtd ?? (v.avarias?.length ?? 0);

// Linhas da planilha de vistorias.
// Painel (lista): com Status, sem gravidade (a lista do servidor não traz as avarias).
// Dashboard: com a gravidade máxima, sem Status (lá todas já foram enviadas).
export function linhasDeVistorias(itens, { painel = true } = {}) {
  const cab = ["Nº", "Data/Hora", "Marca", "Modelo", "Chassi", "Loja de destino", "Avarias", painel ? "Status" : "Gravidade máxima", "Recebimento"];
  return [cab, ...itens.map((v) => {
    const receb = situacaoRecebimento(v);
    return [
      nomeVistoria(v), formatarDataHora(v.realizadaEm), formatarMarca(v.marca ?? ""), v.modelo ?? "", v.chassi ?? "",
      lojaDe(v), qtdAvarias(v), painel ? (STATUS_VISTORIA[v.status] ?? "") : gravidadeMaxima(v),
      receb ? STATUS_RECEBIMENTO[receb] : "",
    ];
  })];
}

// "aaaa-mm-dd" da data local (nome de arquivo).
export const dataDoArquivo = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function baixarBlob(blob, nomeArquivo) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nomeArquivo;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

export function baixarCsv(linhas, nomeArquivo) {
  baixarBlob(new Blob([gerarCsv(linhas)], { type: "text/csv;charset=utf-8" }), nomeArquivo);
}
