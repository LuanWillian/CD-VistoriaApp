// Editor do rascunho da vistoria: aplica as alterações, avisa as telas e grava
// no banco local (textos 400 ms depois da última digitação; fotos, assinaturas
// e escolhas na hora). Os arquivos usam a chave "<id do rascunho>/<nome>".
// Um rascunho novo (novo: true) só vai para o banco na primeira alteração
// feita pelo vistoriador: abrir a tela, trocar de etapa ou uma sugestão
// automática não criam rascunho vazio.
import { chaveLocal } from "./formatos.js";

export function criarEditor({
  storage, rascunho, novo = false, esperaMs = 400, agora = () => new Date().toISOString(), aoErro = () => {},
}) {
  const r = rascunho;
  const ouvintes = new Set();
  let timer = null;
  let fila = Promise.resolve();
  let encerrado = false; // depois de finalizar, o rascunho não é mais gravado
  let existe = !novo; // já está (ou deve estar) no banco local

  const notificar = () => ouvintes.forEach((cb) => cb(r));

  function gravar() {
    clearTimeout(timer);
    timer = null;
    if (encerrado || !existe) return fila;
    r.atualizadoEm = agora();
    const copia = structuredClone(r);
    fila = fila.then(() => storage.salvarRascunho(copia)).catch((e) => aoErro(e));
    return fila;
  }

  function agendar() {
    if (encerrado || !existe) return;
    clearTimeout(timer);
    timer = setTimeout(gravar, esperaMs);
  }

  return {
    get rascunho() {
      return r;
    },
    alterar(fn, { imediato = false, sugestao = false } = {}) {
      fn(r.dados);
      notificar();
      if (!sugestao) existe = true;
      if (imediato) return gravar();
      agendar();
      return Promise.resolve();
    },
    irPara(etapa) {
      r.etapa = etapa;
      return gravar();
    },
    async gravarArquivo(nome, blob, marcar) {
      existe = true;
      await storage.salvarArquivo(chaveLocal(r.id, nome), blob);
      if (marcar) {
        marcar(r.dados);
        notificar();
      }
      await gravar();
    },
    lerArquivo: (nome) => storage.obterArquivo(chaveLocal(r.id, nome)),
    async apagarArquivo(nome, desmarcar) {
      await storage.excluirArquivo(chaveLocal(r.id, nome));
      if (desmarcar) {
        desmarcar(r.dados);
        notificar();
      }
      await gravar();
    },
    descarregar() {
      return timer ? gravar() : fila;
    },
    temPendente: () => timer !== null,
    encerrar() {
      clearTimeout(timer);
      timer = null;
      encerrado = true;
    },
    reabrir() {
      encerrado = false;
    },
    aoMudar(cb) {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
  };
}
