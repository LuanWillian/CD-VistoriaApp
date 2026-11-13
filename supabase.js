// Único módulo que conhece o Supabase. Converte entre o formato do banco
// (snake_case, caminhos no bucket) e o formato local das vistorias.
// O cliente vem de vendor/supabase-2.118.0.umd.js (global `supabase`) e só é
// criado em criarRemoto(); importar este arquivo não toca no navegador.
import { ARQUIVO, arquivoAvaria, arquivoReceb, caminhoDoArquivo, caminhoRemoto } from "./formatos.js";
import { ITENS_POR_PAGINA } from "./config.js";

const BUCKET = "vistorias";

// ---------- Mapeamento local → banco ----------
export function linhaDaVistoria(v) {
  const p = (nome) => caminhoRemoto(v.userId, v.id, nome);
  return {
    id: v.id,
    user_id: v.userId,
    loja: v.loja || null,
    chassi: v.chassi,
    marca: v.marca,
    modelo: v.modelo,
    cor: v.cor,
    km: v.km,
    combustivel: v.combustivel,
    checklist: v.checklist,
    checklist_obs: v.checklistObs,
    sem_avarias: v.semAvarias,
    vistoriador_nome: v.vistoriadorNome,
    motorista_nome: v.motoristaNome,
    realizada_em: v.realizadaEm,
    foto_frente: p(ARQUIVO.frente),
    foto_traseira: p(ARQUIVO.traseira),
    foto_chassi: p(ARQUIVO.chassi),
    assinatura_vistoriador: p(ARQUIVO.assVistoriador),
    assinatura_motorista: p(ARQUIVO.assMotorista),
  };
}

export function linhasDasAvarias(v) {
  return (v.avarias || []).map((a) => ({
    id: a.id, inspection_id: v.id, area: a.area, tipo: a.tipo, gravidade: a.gravidade, descricao: a.descricao,
  }));
}

export function linhasDasFotos(v) {
  return (v.avarias || []).flatMap((a) => (a.fotos || []).map((fotoId) => ({
    id: fotoId, damage_id: a.id, path: caminhoRemoto(v.userId, v.id, arquivoAvaria(fotoId)),
  })));
}

// ---------- Mapeamento banco → local ----------
export function vistoriaDaLinha(linha) {
  const danos = Array.isArray(linha.damages) ? linha.damages : [];
  const soContagem = danos.length === 1 && "count" in danos[0] && !("id" in danos[0]);
  const avarias = soContagem ? [] : danos.map((d) => ({
    id: d.id, area: d.area, tipo: d.tipo, gravidade: d.gravidade, descricao: d.descricao ?? "",
    fotos: (d.damage_photos || []).map((f) => f.id),
  }));
  return {
    id: linha.id,
    userId: linha.user_id,
    numero: linha.numero,
    realizadaEm: new Date(linha.realizada_em).toISOString(),
    loja: linha.loja ?? "",
    chassi: linha.chassi,
    marca: linha.marca,
    modelo: linha.modelo,
    cor: linha.cor ?? "",
    km: linha.km ?? null,
    combustivel: linha.combustivel ?? null,
    checklist: linha.checklist ?? {},
    checklistObs: linha.checklist_obs ?? "",
    semAvarias: linha.sem_avarias ?? false,
    avarias,
    recebimento: recebimentoDaLinha(linha.recebimentos),
    vistoriadorNome: linha.vistoriador_nome ?? "",
    motoristaNome: linha.motorista_nome ?? "",
    status: "sincronizada",
    erro: null,
    enviados: [],
    origem: "remota",
    completa: !soContagem && Array.isArray(linha.damages) && "cor" in linha,
    avariasQtd: soContagem ? danos[0].count : avarias.length,
    arquivosSalvosEm: null,
    atualizadoEm: linha.updated_at ? new Date(linha.updated_at).toISOString() : new Date().toISOString(),
  };
}

// Linha resumida para o dashboard (só o que os indicadores usam).
export function itemDoDashboard(linha) {
  return {
    id: linha.id,
    numero: linha.numero,
    realizadaEm: new Date(linha.realizada_em).toISOString(),
    chassi: linha.chassi,
    marca: linha.marca ?? "",
    modelo: linha.modelo ?? "",
    loja: linha.loja ?? "",
    recebimento: recebimentoDaLinha(linha.recebimentos),
    avarias: (Array.isArray(linha.damages) ? linha.damages : [])
      .map((d) => ({ area: d.area, tipo: d.tipo, gravidade: d.gravidade })),
  };
}

// ---------- Recebimento na loja ----------
// O PostgREST devolve o recebimento embutido como objeto (relação 1:1) ou, em
// algumas versões, como lista de um; sem recebimento, null ou lista vazia.
export function recebimentoDaLinha(dado) {
  const r = Array.isArray(dado) ? dado[0] : dado;
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    status: r.status,
    recebedorNome: r.recebedor_nome,
    loja: r.loja,
    recebidoEm: new Date(r.recebido_em).toISOString(),
    descricao: r.descricao ?? "",
    assinatura: r.assinatura,
    fotos: (r.recebimento_fotos || []).map((f) => f.id),
  };
}

// Nome, loja, conta e data ficam de fora: o banco preenche (gatilho).
export function linhaDoRecebimento(r, inspectionId) {
  const descricao = String(r.descricao ?? "").trim();
  return { id: r.id, inspection_id: inspectionId, status: r.status, descricao: descricao || null, assinatura: r.assinatura };
}

const CAMPOS_RECEBIMENTO = "recebimentos(*, recebimento_fotos(id, path))";
const CAMPOS_LISTA = `id, user_id, numero, realizada_em, chassi, marca, modelo, loja, foto_frente, damages(count), ${CAMPOS_RECEBIMENTO}`;

// ---------- Erros ----------
const MENSAGEM_REDE = "Sem conexão com o servidor.";
const MENSAGEM_SESSAO = "Sua sessão expirou. Entre novamente para enviar as vistorias pendentes.";
const DETALHES = {
  23514: "valor fora do permitido",
  23505: "registro duplicado",
  23502: "campo obrigatório vazio",
  42501: "permissão negada",
};

export function classificarErro(e, online = true) {
  if (!online) return { tipo: "rede", mensagem: MENSAGEM_REDE };
  const status = Number(e?.status ?? e?.statusCode ?? NaN);
  const msg = String(e?.message ?? "");
  const falhaDeRede = e instanceof TypeError || e?.name === "AuthRetryableFetchError"
    || /failed to fetch|networkerror|load failed|fetch failed|network request failed/i.test(msg);
  if (falhaDeRede || status === 0 || status >= 500 || status === 429) return { tipo: "rede", mensagem: MENSAGEM_REDE };
  if (status === 401 || e?.code === "PGRST301" || e?.code === "PGRST303" || /jwt expired/i.test(msg)) {
    return { tipo: "sessao", mensagem: MENSAGEM_SESSAO };
  }
  if (e?.code === "23503") return { tipo: "servidor", mensagem: "Esta vistoria foi excluída pelo CD." };
  const detalhe = DETALHES[e?.code] || (status === 413 ? "arquivo grande demais" : msg || "erro desconhecido");
  return { tipo: "servidor", mensagem: `O servidor recusou os dados: ${detalhe}.` };
}

// Remove o que quebraria a sintaxe do filtro or() do PostgREST.
export function escaparBusca(termo) {
  return String(termo ?? "").replace(/[,()%*\\"]/g, " ").replace(/\s+/g, " ").trim();
}

// Remove do localStorage as chaves de sessão do supabase-js (sb-<ref>-auth-token…).
function apagarSessaoSalva() {
  try {
    const armazenamento = globalThis.localStorage;
    const chaves = [];
    for (let i = 0; i < armazenamento.length; i++) {
      const k = armazenamento.key(i);
      if (k?.startsWith("sb-") && k.includes("-auth-token")) chaves.push(k);
    }
    chaves.forEach((k) => armazenamento.removeItem(k));
  } catch {
    // sem localStorage: não há sessão salva
  }
}

// ---------- Cliente ----------
export function criarRemoto({ url, chave, criarCliente = (u, k, o) => globalThis.supabase.createClient(u, k, o) }) {
  const sb = criarCliente(url, chave, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  const bucket = () => sb.storage.from(BUCKET);
  const checar = ({ data, error }) => {
    if (error) throw error;
    return data;
  };
  const usuario = (u) => (u ? { id: u.id, email: u.email } : null);
  // Consulta em blocos de 1000 linhas (limite padrão do PostgREST) até acabar.
  async function emBlocos(montar, mapa) {
    const BLOCO = 1000;
    const itens = [];
    for (let inicio = 0; ; inicio += BLOCO) {
      const linhas = checar(await montar(sb.from("inspections")).range(inicio, inicio + BLOCO - 1));
      itens.push(...linhas.map(mapa));
      if (linhas.length < BLOCO) return itens;
    }
  }

  return {
    classificarErro,

    async obterSessao() {
      const { data, error } = await sb.auth.getSession();
      const s = data?.session;
      return { sessao: s ? { usuario: usuario(s.user) } : null, erro: error ?? null };
    },
    async entrar(email, senha) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
      return usuario(data.user);
    },
    async sair() {
      const { error } = await sb.auth.signOut({ scope: "local" });
      // Offline com token vencido, o supabase-js devolve erro sem apagar a sessão.
      // Apagar à mão impede que o próximo usuário do aparelho entre como este.
      if (error) {
        sb.auth.stopAutoRefresh?.();
        apagarSessaoSalva();
      }
    },
    async obterPerfil(userId) {
      const linha = checar(await sb.from("perfis").select("nome, papel, loja").eq("id", userId).maybeSingle());
      return linha ? { nome: linha.nome ?? null, papel: linha.papel ?? "vistoriador", loja: linha.loja ?? null } : null;
    },
    aoMudarSessao(cb) {
      const { data } = sb.auth.onAuthStateChange((evento, s) => cb(evento, usuario(s?.user)));
      return () => data.subscription.unsubscribe();
    },

    async enviarArquivo(caminho, blob) {
      checar(await bucket().upload(caminho, blob, { upsert: true, contentType: blob.type || "image/jpeg" }));
    },
    async vistoriaExiste(id) {
      return checar(await sb.from("inspections").select("numero").eq("id", id).maybeSingle());
    },
    async inserirVistoria(v) {
      return checar(await sb.from("inspections").insert(linhaDaVistoria(v)).select("numero").single());
    },
    async gravarAvarias(v) {
      const linhas = linhasDasAvarias(v);
      if (linhas.length) checar(await sb.from("damages").upsert(linhas, { onConflict: "id", ignoreDuplicates: true }));
    },
    async gravarFotosAvaria(v) {
      const linhas = linhasDasFotos(v);
      if (linhas.length) checar(await sb.from("damage_photos").upsert(linhas, { onConflict: "id", ignoreDuplicates: true }));
    },

    async listarVistorias({ pagina = 0, busca = "", de = null, ate = null } = {}) {
      let q = sb.from("inspections")
        .select(CAMPOS_LISTA)
        .order("realizada_em", { ascending: false });
      const t = escaparBusca(busca);
      if (t) q = q.or(`chassi.ilike.*${t}*,marca.ilike.*${t}*,modelo.ilike.*${t}*,numero.ilike.*${t}*`);
      if (de) q = q.gte("realizada_em", de);
      if (ate) q = q.lt("realizada_em", ate);
      const inicio = pagina * ITENS_POR_PAGINA;
      // Pede uma linha a mais só para saber se existe próxima página.
      const linhas = checar(await q.range(inicio, inicio + ITENS_POR_PAGINA));
      return { itens: linhas.slice(0, ITENS_POR_PAGINA).map(vistoriaDaLinha), temMais: linhas.length > ITENS_POR_PAGINA };
    },
    // Painel do computador: TODAS as vistorias (mesmos campos da lista), mais
    // recentes primeiro. Sem teto: o painel não pode esconder vistorias antigas.
    listarTodasVistorias() {
      return emBlocos((q) => q.select(CAMPOS_LISTA)
        .order("realizada_em", { ascending: false }).order("id", { ascending: false }), vistoriaDaLinha);
    },
    // Conta de loja: o RLS já devolve só as vistorias da loja dela; mais antigas primeiro.
    listarParaLoja() {
      return emBlocos((q) => q.select(CAMPOS_LISTA)
        .order("realizada_em", { ascending: true }).order("id", { ascending: true }), vistoriaDaLinha);
    },
    // Todas as vistorias de [de, ate) com as avarias e o recebimento.
    listarParaDashboard({ de, ate }) {
      return emBlocos((q) => q.select(`id, numero, realizada_em, chassi, marca, modelo, loja, damages(area, tipo, gravidade), ${CAMPOS_RECEBIMENTO}`)
        .gte("realizada_em", de).lt("realizada_em", ate)
        .order("realizada_em", { ascending: true }).order("id", { ascending: true }), itemDoDashboard);
    },
    async obterRecebimento(inspectionId) {
      return recebimentoDaLinha(checar(await sb.from("recebimentos").select("*, recebimento_fotos(id, path)")
        .eq("inspection_id", inspectionId).maybeSingle()));
    },
    async inserirRecebimento(r, inspectionId) {
      return recebimentoDaLinha(checar(await sb.from("recebimentos").insert(linhaDoRecebimento(r, inspectionId))
        .select("*, recebimento_fotos(id, path)").single()));
    },
    async gravarFotosRecebimento(r, inspectionId) {
      const v = { id: inspectionId, recebimento: r };
      const linhas = r.fotos.map((fotoId) => ({ id: fotoId, recebimento_id: r.id, path: caminhoDoArquivo(v, arquivoReceb(fotoId)) }));
      if (linhas.length) checar(await sb.from("recebimento_fotos").upsert(linhas, { onConflict: "id", ignoreDuplicates: true }));
    },
    async obterVistoriaCompleta(id) {
      return vistoriaDaLinha(checar(await sb.from("inspections").select(`*, damages(*, damage_photos(*)), ${CAMPOS_RECEBIMENTO}`).eq("id", id).single()));
    },
    async urlsAssinadas(caminhos, segundos = 3600) {
      if (!caminhos.length) return new Map();
      const data = checar(await bucket().createSignedUrls(caminhos, segundos));
      return new Map(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
    },
    async baixarArquivo(caminho) {
      return checar(await bucket().download(caminho));
    },
    // donoRecebimento: conta da loja que recebeu (os arquivos dela ficam na pasta dela).
    async excluirVistoriaRemota(userId, id, { donoRecebimento } = {}) {
      // O RLS não dá erro quando recusa um DELETE: só apaga 0 linhas. Pede as linhas
      // apagadas; se nenhuma veio e a vistoria continua lá, foi recusa (permissão).
      const apagadas = checar(await sb.from("inspections").delete().eq("id", id).select("id"));
      if (!apagadas?.length && checar(await sb.from("inspections").select("id").eq("id", id).maybeSingle())) {
        throw Object.assign(new Error("Sem permissão para excluir esta vistoria."), { code: "42501" });
      }
      for (const dono of [userId, donoRecebimento].filter(Boolean)) {
        const pasta = `${dono}/${id}`;
        const itens = checar(await bucket().list(pasta, { limit: 1000 }));
        const caminhos = itens.map((i) => `${pasta}/${i.name}`);
        if (caminhos.length) checar(await bucket().remove(caminhos));
      }
    },
  };
}
