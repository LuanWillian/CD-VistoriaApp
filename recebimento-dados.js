// Regras do recebimento na loja: situação de cada vistoria, validação do
// formulário, listas da tela Recebimentos e contagens. Só funções puras.
//
// v.recebimento = null | { id, userId, status: "conforme"|"divergencia",
//   recebedorNome, loja, recebidoEm, descricao, assinatura, fotos: [fotoId] }
import { nomeVistoria } from "./formatos.js";
import { semAcento } from "./painel-dados.js";

export const STATUS_RECEBIMENTO = { conforme: "Conforme", divergencia: "Com divergência", aguardando: "Aguardando recebimento" };

const temLoja = (v) => Boolean(String(v.loja ?? "").trim());

// null = vistoria sem loja de destino (antiga): não entra no recebimento.
export function situacaoRecebimento(v) {
  if (v.recebimento) return v.recebimento.status;
  return temLoja(v) ? "aguardando" : null;
}

export function validarRecebimento({ status, descricao, assinatura }) {
  const erros = [];
  if (status !== "conforme" && status !== "divergencia") erros.push({ campo: "status", mensagem: "Escolha como o carro chegou." });
  if (status === "divergencia" && !String(descricao ?? "").trim()) {
    erros.push({ campo: "descricao", mensagem: "Descreva o que está diferente." });
  }
  if (!assinatura) erros.push({ campo: "assinatura", mensagem: "Falta a assinatura de quem recebeu." });
  return erros;
}

export function separarRecebimentos(itens) {
  const aReceber = itens.filter((v) => situacaoRecebimento(v) === "aguardando")
    .sort((a, b) => a.realizadaEm.localeCompare(b.realizadaEm));
  const recebidos = itens.filter((v) => v.recebimento)
    .sort((a, b) => b.recebimento.recebidoEm.localeCompare(a.recebimento.recebidoEm));
  return { aReceber, recebidos };
}

export function buscarRecebimentos(itens, termo) {
  const t = semAcento(termo).trim();
  if (!t) return itens;
  return itens.filter((v) => [v.chassi, v.marca, v.modelo, nomeVistoria(v)].some((x) => semAcento(x).includes(t)));
}

export function contarRecebimentos(itens) {
  const c = { aguardando: 0, conforme: 0, divergencia: 0 };
  for (const v of itens) {
    const s = situacaoRecebimento(v);
    if (s) c[s]++;
  }
  return c;
}

const dois = (n) => String(n).padStart(2, "0");
export function textoJaRecebido(r) {
  const d = new Date(r.recebidoEm);
  return `Este carro já foi recebido por ${r.recebedorNome} em ${dois(d.getDate())}/${dois(d.getMonth() + 1)} às ${dois(d.getHours())}:${dois(d.getMinutes())}.`;
}
