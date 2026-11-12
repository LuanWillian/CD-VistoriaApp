// Banco local (IndexedDB): rascunhos, vistorias, arquivos (Blob), fila de
// exclusões e preferências. Nenhum acesso ao IndexedDB acontece ao importar.
import { vistoriaDoRascunho } from "./formatos.js";

// A página de testes (tests/navegador) usa um banco separado e nunca toca nos dados reais.
const NOME = globalThis.location?.pathname?.includes("/tests/") ? "vistoria-veicular-testes" : "vistoria-veicular";
const VERSAO = 1;
const DIA = 24 * 60 * 60 * 1000;

export class ArmazenamentoCheioError extends Error {
  constructor() {
    super("Armazenamento do aparelho cheio. Envie as vistorias pendentes e exclua vistorias antigas para liberar espaço.");
    this.name = "ArmazenamentoCheioError";
  }
}

export class BancoIndisponivelError extends Error {
  constructor() {
    super("Este navegador não permite salvar dados offline. Use o app instalado ou outro navegador.");
    this.name = "BancoIndisponivelError";
  }
}

let conexao = null;

function abrirBanco() {
  if (conexao) return conexao;
  conexao = new Promise((resolver, rejeitar) => {
    let req;
    try {
      req = indexedDB.open(NOME, VERSAO);
    } catch {
      rejeitar(new BancoIndisponivelError());
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("rascunhos", { keyPath: "id" }).createIndex("userId", "userId");
      const v = db.createObjectStore("vistorias", { keyPath: "id" });
      v.createIndex("userId", "userId");
      v.createIndex("status", "status");
      db.createObjectStore("arquivos");
      db.createObjectStore("exclusoes", { keyPath: "id" }).createIndex("userId", "userId");
      db.createObjectStore("meta");
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        conexao = null;
      };
      resolver(db);
    };
    req.onerror = () => rejeitar(new BancoIndisponivelError());
  }).catch((e) => {
    conexao = null;
    throw e;
  });
  return conexao;
}

const traduzir = (e) => (e?.name === "QuotaExceededError" ? new ArmazenamentoCheioError() : e);

const pedir = (req) => new Promise((resolver, rejeitar) => {
  req.onsuccess = () => resolver(req.result);
  req.onerror = () => rejeitar(req.error);
});

// Roda fn dentro de uma transação e resolve com o retorno de fn depois do commit.
async function tx(stores, modo, fn) {
  const db = await abrirBanco();
  return new Promise((resolver, rejeitar) => {
    let t;
    try {
      t = db.transaction(stores, modo);
    } catch (e) {
      rejeitar(traduzir(e));
      return;
    }
    let resultado;
    t.oncomplete = () => resolver(resultado);
    t.onerror = () => rejeitar(traduzir(t.error));
    t.onabort = () => rejeitar(traduzir(t.error || new Error("Operação no banco local cancelada.")));
    Promise.resolve()
      .then(() => fn((nome) => t.objectStore(nome)))
      .then((r) => { resultado = r; }, (e) => {
        try { t.abort(); } catch { /* já encerrada */ }
        rejeitar(traduzir(e));
      });
  });
}

const faixaDoId = (id) => IDBKeyRange.bound(`${id}/`, `${id}/￿`);
const porData = (campo) => (a, b) => String(b[campo]).localeCompare(String(a[campo]));

// ---------- Rascunhos ----------
export const salvarRascunho = (r) => tx(["rascunhos"], "readwrite", (s) => { s("rascunhos").put(r); });
export const obterRascunho = (id) => tx(["rascunhos"], "readonly", (s) => pedir(s("rascunhos").get(id)));
export const listarRascunhos = async (userId) =>
  (await tx(["rascunhos"], "readonly", (s) => pedir(s("rascunhos").index("userId").getAll(userId)))).sort(porData("atualizadoEm"));
export const excluirRascunho = (id) => tx(["rascunhos", "arquivos"], "readwrite", (s) => {
  s("rascunhos").delete(id);
  s("arquivos").delete(faixaDoId(id));
});

// ---------- Vistorias ----------
export const salvarVistoria = (v) => tx(["vistorias"], "readwrite", (s) => { s("vistorias").put(v); });
// Guarda de uma vez (uma transação só) as vistorias que ainda não existem no
// aparelho; as que já existem não são tocadas (podem ter fotos ou estado local).
export const guardarSeAusentes = (lista) => tx(["vistorias"], "readwrite", async (s) => {
  const existentes = new Set(await pedir(s("vistorias").getAllKeys()));
  for (const v of lista) if (!existentes.has(v.id)) s("vistorias").put(v);
});
export const obterVistoria = (id) => tx(["vistorias"], "readonly", (s) => pedir(s("vistorias").get(id)));
export const listarVistorias = async (userId) =>
  (await tx(["vistorias"], "readonly", (s) => pedir(s("vistorias").index("userId").getAll(userId)))).sort(porData("realizadaEm"));
export const excluirVistoriaLocal = (id) => tx(["vistorias", "arquivos"], "readwrite", (s) => {
  s("vistorias").delete(id);
  s("arquivos").delete(faixaDoId(id));
});

export function finalizarRascunho(rascunho, realizadaEm) {
  const v = vistoriaDoRascunho(rascunho, realizadaEm);
  return tx(["rascunhos", "vistorias"], "readwrite", (s) => {
    s("vistorias").put(v);
    s("rascunhos").delete(rascunho.id);
    return v;
  });
}

// ---------- Arquivos ----------
export const salvarArquivo = (chave, blob) => tx(["arquivos"], "readwrite", (s) => { s("arquivos").put(blob, chave); });
export const obterArquivo = (chave) => tx(["arquivos"], "readonly", (s) => pedir(s("arquivos").get(chave)));
export const excluirArquivo = (chave) => tx(["arquivos"], "readwrite", (s) => { s("arquivos").delete(chave); });
export const excluirArquivos = (id) => tx(["arquivos"], "readwrite", (s) => { s("arquivos").delete(faixaDoId(id)); });

// ---------- Fila de exclusões ----------
export const enfileirarExclusao = (item) => tx(["exclusoes"], "readwrite", (s) => { s("exclusoes").put(item); });
export const listarExclusoes = (userId) =>
  tx(["exclusoes"], "readonly", (s) => pedir(s("exclusoes").index("userId").getAll(userId)));
export const removerExclusao = (id) => tx(["exclusoes"], "readwrite", (s) => { s("exclusoes").delete(id); });

// ---------- Preferências ----------
export const obterMeta = (chave) => tx(["meta"], "readonly", (s) => pedir(s("meta").get(chave)));
export const salvarMeta = (chave, valor) => tx(["meta"], "readwrite", (s) => { s("meta").put(valor, chave); });
export const removerMeta = (chave) => tx(["meta"], "readwrite", (s) => { s("meta").delete(chave); });

// ---------- Rascunho do recebimento na loja ----------
// Escolha, texto e ids das fotos em meta "receb:<vistoria>"; assinatura e fotos
// em arquivos "receb-<vistoria>/..." (chaveRascunhoReceb em recebimento-envio.js).
export const salvarRascunhoRecebimento = (inspectionId, dados) => salvarMeta(`receb:${inspectionId}`, dados);
export const obterRascunhoRecebimento = (inspectionId) => obterMeta(`receb:${inspectionId}`);
export async function excluirRascunhoRecebimento(inspectionId) {
  await removerMeta(`receb:${inspectionId}`);
  await excluirArquivos(`receb-${inspectionId}`);
}

// Vistorias já enviadas, de qualquer usuário: todos veem tudo, então as cópias
// guardadas aqui (inclusive as de outras pessoas) servem para ver a lista offline.
export const listarSincronizadas = async () =>
  (await tx(["vistorias"], "readonly", (s) => pedir(s("vistorias").index("status").getAll("sincronizada")))).sort(porData("realizadaEm"));

// ---------- Limpezas ----------
// Ao sair: apaga do aparelho todas as vistorias já enviadas, de qualquer pessoa
// (o servidor tem a cópia). Pendentes e com erro nunca são apagadas.
export const limparCacheSincronizado = () => tx(["vistorias", "arquivos"], "readwrite", async (s) => {
  const lista = await pedir(s("vistorias").index("status").getAll("sincronizada"));
  for (const v of lista) {
    s("vistorias").delete(v.id);
    s("arquivos").delete(faixaDoId(v.id));
  }
});

// Libera espaço: fotos de vistorias sincronizadas há mais de `dias`. Pendentes nunca.
export const limparFotosAntigas = (dias, agora = new Date()) => tx(["vistorias", "arquivos"], "readwrite", async (s) => {
  const limite = agora.getTime() - dias * DIA;
  const lista = await pedir(s("vistorias").index("status").getAll("sincronizada"));
  for (const v of lista) {
    if (!v.arquivosSalvosEm || new Date(v.arquivosSalvosEm).getTime() >= limite) continue;
    s("arquivos").delete(faixaDoId(v.id));
    s("vistorias").put({ ...v, arquivosSalvosEm: null });
  }
});

export async function pedirPersistencia() {
  try {
    if (await obterMeta("persistenciaPedida")) return true;
    const ok = (await navigator.storage?.persist?.()) ?? false;
    await salvarMeta("persistenciaPedida", true);
    return ok;
  } catch {
    return false;
  }
}

// Só para testes.
export async function apagarBanco() {
  if (conexao) {
    (await conexao.catch(() => null))?.close();
    conexao = null;
  }
  await new Promise((resolver, rejeitar) => {
    const req = indexedDB.deleteDatabase(NOME);
    req.onsuccess = () => resolver();
    req.onerror = () => rejeitar(req.error);
    req.onblocked = () => resolver();
  });
}
