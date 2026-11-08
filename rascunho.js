// Editor do rascunho da vistoria: aplica as alterações, avisa as telas e grava
// no banco local (textos 400 ms depois da última digitação; fotos, assinaturas
// e escolhas na hora). Os arquivos usam a chave "<id do rascunho>/<nome>".
import { chaveLocal } from "./formatos.js";

export function criarEditor({
  storage, rascunho, esperaMs = 400, agora = () => new Date().toISOString(), aoErro = () => {},
}) {
  const r = rascunho;
  const ouvintes = new Set();
  let timer = null;
  let fila = Promise.resolve();

  const notificar = () => ouvintes.forEach((cb) => cb(r));

  function gravar() {
    clearTimeout(timer);
    timer = null;
    r.atualizadoEm = agora();
    const copia = structuredClone(r);
    fila = fila.then(() => storage.salvarRascunho(copia)).catch((e) => aoErro(e));
    return fila;
  }

  function agendar() {
    clearTimeout(timer);
    timer = setTimeout(gravar, esperaMs);
  }

  return {
    get rascunho() {
      return r;
    },
    alterar(fn, { imediato = false } = {}) {
      fn(r.dados);
      notificar();
      if (imediato) return gravar();
      agendar();
      return Promise.resolve();
    },
    irPara(etapa) {
      r.etapa = etapa;
      return gravar();
    },
    async gravarArquivo(nome, blob, marcar) {
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
    aoMudar(cb) {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
  };
}
