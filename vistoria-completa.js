// Vistoria completa (dados + arquivos) para o detalhe e para o PDF: baixa do
// servidor o que falta e guarda no aparelho. Usado por views/detalhe.js e pelo
// "Baixar PDF" de várias vistorias no painel do computador.
import { arquivosDaVistoria, arquivosDoRecebimento, caminhoDoArquivo, chaveLocal } from "./formatos.js";

// Busca a vistoria inteira no servidor e guarda os arquivos que conseguir baixar.
export async function baixarVistoriaCompleta(ctx, id) {
  const completa = await ctx.remoto.obterVistoriaCompleta(id);
  for (const nome of [...arquivosDaVistoria(completa), ...arquivosDoRecebimento(completa)]) {
    try {
      const blob = await ctx.remoto.baixarArquivo(caminhoDoArquivo(completa, nome));
      await ctx.storage.salvarArquivo(chaveLocal(id, nome), blob);
    } catch {
      // arquivo indisponível agora: a tela usa URL assinada e o PDF tenta de novo depois
    }
  }
  const v = { ...completa, completa: true, arquivosSalvosEm: new Date().toISOString() };
  await ctx.storage.salvarVistoria(v);
  return v;
}

// Imagem para o PDF: a do aparelho; senão baixa do servidor (e guarda).
// atual(): a vistoria de agora (o número oficial pode chegar depois).
export function criarObterImagem(ctx, id, atual) {
  return async function obterImagem(nome) {
    const local = await ctx.storage.obterArquivo(chaveLocal(id, nome));
    if (local) return local;
    const v = atual();
    if (!ctx.online() || !v.numero) return null;
    try {
      const blob = await ctx.remoto.baixarArquivo(caminhoDoArquivo(v, nome));
      await ctx.storage.salvarArquivo(chaveLocal(id, nome), blob);
      return blob;
    } catch {
      return null;
    }
  };
}

// Vistoria pronta para gerar o PDF (painel do computador, várias de uma vez).
// Mesmas regras do detalhe: de outra pessoa só a já enviada; a remota incompleta
// é baixada (precisa de internet). Lança Error com a mensagem para o usuário.
export async function vistoriaParaPdf(ctx, id, usuarioId) {
  let v = await ctx.storage.obterVistoria(id);
  if (v && v.userId !== usuarioId && v.status !== "sincronizada") v = null;
  if (!v || (v.origem === "remota" && !v.completa)) {
    if (!ctx.online()) throw new Error("Conecte-se à internet para baixar esta vistoria.");
    v = await baixarVistoriaCompleta(ctx, id);
  }
  if (!v || v.status === "excluindo") throw new Error("Vistoria não encontrada.");
  return v;
}
