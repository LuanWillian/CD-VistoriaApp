// Envio do recebimento na loja. Idempotente: o id vem do rascunho guardado no
// aparelho, então "Tentar de novo" depois de uma queda não duplica nada.
// Ordem: confere se já existe → arquivos → recebimento → fotos → apaga o rascunho.
import { ARQUIVO, arquivoReceb, caminhoRemoto, chaveLocal } from "./formatos.js";

export class JaRecebidoError extends Error {
  constructor(recebimento) {
    super("Este carro já foi recebido.");
    this.recebimento = recebimento;
  }
}

export const chaveRascunhoReceb = (inspectionId) => `receb-${inspectionId}`;

export async function enviarRecebimento({ remoto, storage, usuario, vistoria, rascunho }) {
  const existente = await remoto.obterRecebimento(vistoria.id);
  if (existente && existente.id !== rascunho.id) throw new JaRecebidoError(existente);

  const pasta = chaveRascunhoReceb(vistoria.id);
  const assinatura = await storage.obterArquivo(chaveLocal(pasta, ARQUIVO.recebAssinatura));
  if (!assinatura) throw new Error("Falta a assinatura de quem recebeu.");
  const fotos = [];
  for (const fotoId of rascunho.fotos || []) {
    const blob = await storage.obterArquivo(chaveLocal(pasta, arquivoReceb(fotoId)));
    if (!blob) throw new Error("Uma foto da divergência não foi encontrada neste aparelho. Tire a foto de novo.");
    fotos.push([fotoId, blob]);
  }

  const caminho = (nome) => caminhoRemoto(usuario.id, vistoria.id, nome);
  await remoto.enviarArquivo(caminho(ARQUIVO.recebAssinatura), assinatura);
  for (const [fotoId, blob] of fotos) await remoto.enviarArquivo(caminho(arquivoReceb(fotoId)), blob);

  const r = {
    id: rascunho.id,
    userId: usuario.id,
    status: rascunho.status,
    descricao: rascunho.status === "divergencia" ? rascunho.descricao : "",
    assinatura: caminho(ARQUIVO.recebAssinatura),
    fotos: rascunho.status === "divergencia" ? fotos.map(([id]) => id) : [],
  };
  if (!existente) {
    try {
      await remoto.inserirRecebimento(r, vistoria.id);
    } catch (e) {
      if (e?.code !== "23505") throw e;
      const quemGravou = await remoto.obterRecebimento(vistoria.id);
      if (quemGravou?.id !== r.id) throw new JaRecebidoError(quemGravou);
    }
  }
  await remoto.gravarFotosRecebimento(r, vistoria.id);
  await storage.excluirRascunhoRecebimento(vistoria.id);
  return (await remoto.obterRecebimento(vistoria.id)) || r;
}
