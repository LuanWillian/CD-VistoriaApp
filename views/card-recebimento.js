// Card "Recebimento na loja" (detalhe da vistoria) e selo do recebimento (listas).
// Usado pelo CD e pela conta de loja. Só HTML; os dados vêm escapados.
import { arquivoReceb, ARQUIVO, formatarDataHora } from "../formatos.js";
import { STATUS_RECEBIMENTO, situacaoRecebimento } from "../recebimento-dados.js";
import { esc, icone } from "../ui.js";
import { miniaturaHtml } from "../photos.js";

const ICONE = { aguardando: "nuvem", conforme: "check", divergencia: "alerta" };

export function seloRecebimento(v) {
  const s = situacaoRecebimento(v);
  if (!s) return "";
  return `<span class="selo selo-receb-${s}">${icone(ICONE[s])} ${STATUS_RECEBIMENTO[s]}</span>`;
}

// fontes: Map nome do arquivo → URL (blob local ou assinada), como no detalhe.
export function htmlCardRecebimento(v, fontes = new Map()) {
  const s = situacaoRecebimento(v);
  if (!s) return "";
  const r = v.recebimento;
  const corpo = !r
    ? `<p>${seloRecebimento(v)}</p><p class="texto-2">Loja de destino: ${esc(v.loja)}</p>`
    : `<p>${seloRecebimento(v)}</p>
      <p class="receb-quem">Recebido por ${esc(r.recebedorNome)} — ${esc(r.loja)}</p>
      <p class="pequeno texto-2">${formatarDataHora(r.recebidoEm)}</p>
      ${r.status === "divergencia" && r.descricao ? `<p class="receb-descricao"><strong>O que está diferente:</strong> ${esc(r.descricao)}</p>` : ""}
      ${r.fotos.length ? `<div class="miniaturas">${r.fotos.map((f, i) => {
        const src = fontes.get(arquivoReceb(f));
        return src ? miniaturaHtml(src, `Divergência, foto ${i + 1}`) : "";
      }).join("")}</div>` : ""}
      <div class="assinatura-ver receb-assinatura">${fontes.get(ARQUIVO.recebAssinatura)
        ? `<img src="${fontes.get(ARQUIVO.recebAssinatura)}" alt="Assinatura: ${esc(r.recebedorNome)}">` : ""}</div>`;
  return `<section class="secao det-receb" aria-labelledby="h-receb">
      <h2 id="h-receb">Recebimento na loja</h2>
      ${corpo}
    </section>`;
}
