// Fila de sincronização: envia as vistorias pendentes do aparelho para o
// servidor e aplica as exclusões feitas offline. Não conhece o Supabase:
// recebe `storage` e `remoto` prontos (o que permite testar com dublês).
import { arquivosDaVistoria, caminhoRemoto, chaveLocal, rotuloArquivo } from "./formatos.js";

class ArquivoAusenteError extends Error {
  constructor(nome) {
    super(`O arquivo "${rotuloArquivo(nome)}" não foi encontrado neste aparelho.`);
  }
}

const PARA_ENVIAR = new Set(["pendente", "erro"]);

export function criarSincronizador({
  storage, remoto, usuarioAtual, estaOnline, locks = globalThis.navigator?.locks,
}) {
  const eventos = new EventTarget();
  let emAndamento = null;
  let sincronizando = false;
  let sessaoExpirada = false;

  async function contar() {
    const u = usuarioAtual();
    if (!u) return { pendentes: 0, erros: 0 };
    const lista = await storage.listarVistorias(u.id);
    return {
      pendentes: lista.filter((v) => v.status === "pendente").length,
      erros: lista.filter((v) => v.status === "erro").length,
    };
  }

  async function avisar() {
    const c = await contar().catch(() => ({ pendentes: 0, erros: 0 }));
    eventos.dispatchEvent(new CustomEvent("mudou", { detail: { ...c, sincronizando, sessaoExpirada } }));
  }

  // Relê a vistoria antes de gravar: se ela virou "excluindo" (ou sumiu) no
  // meio do envio, nada é sobrescrito. Devolve false nesse caso.
  async function atualizar(id, mudancas) {
    const atual = await storage.obterVistoria(id);
    if (!atual || atual.status === "excluindo") return false;
    await storage.salvarVistoria({ ...atual, ...mudancas });
    return true;
  }

  async function enviarVistoria(v) {
    const enviados = [...(v.enviados || [])];
    for (const nome of arquivosDaVistoria(v)) {
      if (enviados.includes(nome)) continue;
      const blob = await storage.obterArquivo(chaveLocal(v.id, nome));
      if (!blob) throw new ArquivoAusenteError(nome);
      await remoto.enviarArquivo(caminhoRemoto(v.userId, v.id, nome), blob);
      enviados.push(nome);
      if (!(await atualizar(v.id, { enviados: [...enviados] }))) return;
    }
    const existente = await remoto.vistoriaExiste(v.id);
    const { numero } = existente || (await remoto.inserirVistoria(v));
    await remoto.gravarAvarias(v);
    await remoto.gravarFotosAvaria(v);
    const agora = new Date().toISOString();
    await atualizar(v.id, { status: "sincronizada", numero, erro: null, arquivosSalvosEm: agora, atualizadoEm: agora });
  }

  async function rodada(u) {
    const resumo = { enviadas: 0, erros: 0, exclusoesRecusadas: 0, interrompido: null };
    const interromper = (tipo) => {
      resumo.interrompido = tipo;
      if (tipo === "sessao") sessaoExpirada = true;
      return resumo;
    };

    for (const item of await storage.listarExclusoes(u.id)) {
      try {
        await remoto.excluirVistoriaRemota(item.donoId || u.id, item.id, { donoRecebimento: item.donoRecebimento || null });
        await storage.removerExclusao(item.id);
        await storage.excluirVistoriaLocal(item.id);
      } catch (e) {
        const c = remoto.classificarErro(e, estaOnline());
        if (c.tipo !== "servidor") return interromper(c.tipo);
        // Recusa do servidor (ex.: sem permissão): tentar de novo não adianta. A
        // vistoria volta para a lista e o app avisa (resumo.exclusoesRecusadas).
        await storage.removerExclusao(item.id);
        const v = await storage.obterVistoria(item.id);
        if (v?.status === "excluindo") await storage.salvarVistoria({ ...v, status: "sincronizada" });
        resumo.exclusoesRecusadas++;
      }
    }

    const lista = (await storage.listarVistorias(u.id))
      .filter((v) => PARA_ENVIAR.has(v.status))
      .sort((a, b) => a.realizadaEm.localeCompare(b.realizadaEm));

    for (const v of lista) {
      try {
        await enviarVistoria(v);
        if ((await storage.obterVistoria(v.id))?.status === "sincronizada") resumo.enviadas++;
      } catch (e) {
        if (e instanceof ArquivoAusenteError) {
          await atualizar(v.id, { status: "erro", erro: e.message });
          resumo.erros++;
          continue;
        }
        const c = remoto.classificarErro(e, estaOnline());
        if (c.tipo === "servidor") {
          await atualizar(v.id, { status: "erro", erro: c.mensagem });
          resumo.erros++;
          continue;
        }
        return interromper(c.tipo);
      }
    }
    sessaoExpirada = false;
    return resumo;
  }

  async function executar() {
    const u = usuarioAtual();
    if (!u) return { enviadas: 0, erros: 0, interrompido: "sem-usuario" };
    if (!estaOnline()) {
      await avisar();
      return { enviadas: 0, erros: 0, interrompido: "offline" };
    }
    sincronizando = true;
    await avisar();
    try {
      if (!locks) return await rodada(u);
      return await locks.request("vistoria-sync", { ifAvailable: true }, async (lock) => {
        if (!lock) return { enviadas: 0, erros: 0, interrompido: "ocupado" };
        return rodada(u);
      });
    } finally {
      sincronizando = false;
      await avisar();
    }
  }

  // Uma rodada por vez; um pedido feito durante a rodada (ex.: vistoria recém-
  // finalizada ou excluída) gera mais uma rodada logo em seguida.
  let pedidoDeNovo = false;
  function sincronizar() {
    if (emAndamento) {
      pedidoDeNovo = true;
      return emAndamento;
    }
    emAndamento = (async () => {
      let resultado;
      do {
        pedidoDeNovo = false;
        resultado = await executar();
      } while (pedidoDeNovo && !resultado.interrompido);
      return resultado;
    })().finally(() => { emAndamento = null; });
    return emAndamento;
  }

  return { sincronizar, contar, eventos };
}
