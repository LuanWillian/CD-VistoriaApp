// Único módulo que conhece o Supabase. Converte entre o formato do banco
// (snake_case, caminhos no bucket) e o formato local das vistorias.
// O cliente vem de vendor/supabase-2.118.0.umd.js (global `supabase`) e só é
// criado em criarRemoto(); importar este arquivo não toca no navegador.
import { ARQUIVO, arquivoAvaria, caminhoRemoto } from "./formatos.js";
import { ITENS_POR_PAGINA } from "./config.js";

const BUCKET = "vistorias";

// ---------- Mapeamento local → banco ----------
export function linhaDaVistoria(v) {
  const p = (nome) => caminhoRemoto(v.userId, v.id, nome);
  return {
    id: v.id,
    user_id: v.userId,
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

// ---------- Erros ----------
const MENSAGEM_REDE = "Sem conexão com o servidor.";
const MENSAGEM_SESSAO = "Sua sessão expirou. Entre novamente para enviar as vistorias pendentes.";
const DETALHES = {
  23514: "valor fora do permitido",
  23505: "registro duplicado",
  23503: "referência inexistente",
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
      const linha = checar(await sb.from("perfis").select("nome").eq("id", userId).maybeSingle());
      return linha?.nome ?? null;
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
        .select("id, user_id, numero, realizada_em, chassi, marca, modelo, foto_frente, damages(count)")
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
    async obterVistoriaCompleta(id) {
      return vistoriaDaLinha(checar(await sb.from("inspections").select("*, damages(*, damage_photos(*))").eq("id", id).single()));
    },
    async urlsAssinadas(caminhos, segundos = 3600) {
      if (!caminhos.length) return new Map();
      const data = checar(await bucket().createSignedUrls(caminhos, segundos));
      return new Map(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
    },
    async baixarArquivo(caminho) {
      return checar(await bucket().download(caminho));
    },
    async excluirVistoriaRemota(userId, id) {
      checar(await sb.from("inspections").delete().eq("id", id));
      const pasta = `${userId}/${id}`;
      const itens = checar(await bucket().list(pasta, { limit: 1000 }));
      const caminhos = itens.map((i) => `${pasta}/${i.name}`);
      if (caminhos.length) checar(await bucket().remove(caminhos));
    },
  };
}
