// Card "Recebimento na loja" (detalhe da vistoria) e selo do recebimento (listas).
// Usado pelo CD e pela conta de loja. Só HTML; os dados vêm escapados.
import { arquivoReceb, ARQUIVO, formatarDataHora } from "../formatos.js";
import { STATUS_RECEBIMENTO, situacaoRecebimento } from "../recebimento-dados.js";
import { esc, icone } from "../ui.js";
import { miniaturaHtml } from "../photos.js";

const ICONE = { aguardando: "nuvem", conforme: "check", divergencia: "alerta" };
// Computador: ícones e textos curtos do visual do computador.
const ICONE_CURTO = { aguardando: "relogio", conforme: "checkCirculo", divergencia: "alertaCirculo" };
const TEXTO_CURTO = { aguardando: "Aguardando", conforme: "Conforme", divergencia: "Com divergência" };

export function seloRecebimento(v, { curto = false } = {}) {
  const s = situacaoRecebimento(v);
  if (!s) return "";
  return curto
    ? `<span class="selo selo-receb-${s}">${icone(ICONE_CURTO[s])} ${TEXTO_CURTO[s]}</span>`
    : `<span class="selo selo-receb-${s}">${icone(ICONE[s])} ${STATUS_RECEBIMENTO[s]}</span>`;
}

// fontes: Map nome do arquivo → URL (blob local ou assinada), como no detalhe.
// Visual do celular: cabeçalho com o selo à direita; quem recebeu e quando; o que
// está diferente num bloco vermelho; fotos e a assinatura numa linha.
export function htmlCardRecebimento(v, fontes = new Map()) {
  const s = situacaoRecebimento(v);
  if (!s) return "";
  const r = v.recebimento;
  const corpo = !r
    ? `<p class="cm-receb-texto">Aguardando recebimento na <strong>${esc(v.loja)}</strong>.</p>`
    : `<p class="cm-receb-texto receb-quem">Recebido por <strong>${esc(r.recebedorNome)}</strong> — ${esc(r.loja)}</p>
      <p class="cm-receb-quando">${formatarDataHora(r.recebidoEm)}</p>
      ${r.status === "divergencia" && r.descricao ? `<p class="cm-receb-divergencia"><strong>O que está diferente:</strong> ${esc(r.descricao)}</p>` : ""}
      <div class="cm-receb-arquivos">
        ${r.fotos.map((f, i) => {
          const src = fontes.get(arquivoReceb(f));
          return src ? miniaturaHtml(src, `Divergência, foto ${i + 1}`) : "";
        }).join("")}
        <div class="cm-receb-assinatura">${fontes.get(ARQUIVO.recebAssinatura)
          ? `<img src="${fontes.get(ARQUIVO.recebAssinatura)}" alt="Assinatura: ${esc(r.recebedorNome)}">` : ""}</div>
      </div>`;
  return `<section class="secao cm-cartao det-receb" aria-labelledby="h-receb">
      <div class="cm-cartao-cabeca"><h2 id="h-receb">Recebimento na loja</h2>${seloRecebimento(v)}</div>
      <div class="cm-cartao-corpo">${corpo}</div>
    </section>`;
}

// Mesmo card no visual do computador: cabeçalho com o selo à direita; quem recebeu,
// quando, o que está diferente, fotos e a assinatura numa linha.
export function htmlCardRecebimentoComputador(v, fontes = new Map()) {
  const s = situacaoRecebimento(v);
  if (!s) return "";
  const r = v.recebimento;
  const corpo = !r
    ? `<p class="cb-receb-texto">Aguardando recebimento na <strong>${esc(v.loja)}</strong>.</p>`
    : `<p class="cb-receb-texto">Recebido por <strong>${esc(r.recebedorNome)}</strong> — ${esc(r.loja)} · <span class="cb-cinza">${formatarDataHora(r.recebidoEm)}</span></p>
      ${r.status === "divergencia" && r.descricao ? `<p class="cb-receb-divergencia"><strong>O que está diferente:</strong> ${esc(r.descricao)}</p>` : ""}
      <div class="cb-receb-arquivos">
        ${r.fotos.map((f, i) => {
          const src = fontes.get(arquivoReceb(f));
          return src ? miniaturaHtml(src, `Divergência, foto ${i + 1}`, "") : "";
        }).join("")}
        <div class="cb-receb-assinatura">${fontes.get(ARQUIVO.recebAssinatura)
          ? `<img src="${fontes.get(ARQUIVO.recebAssinatura)}" alt="Assinatura: ${esc(r.recebedorNome)}">` : ""}</div>
      </div>`;
  return `<section class="secao cb-cartao det-receb" aria-labelledby="h-receb">
      <div class="cb-cartao-cabeca"><h2 id="h-receb">Recebimento na loja</h2>${seloRecebimento(v, { curto: true })}</div>
      <div class="cb-cartao-corpo">${corpo}</div>
    </section>`;
}
