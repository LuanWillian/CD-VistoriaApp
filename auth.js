// Login, sessão e saída. A sessão continua valendo offline: guardamos id e
// e-mail do usuário no banco local, e o token é renovado quando a internet volta
// (o supabase-js não apaga a sessão salva quando a renovação falha por rede).
// O nome do vistoriador vem do perfil da conta (tabela perfis, cadastrada pelo
// administrador) e fica no mesmo cache, para a etapa de assinaturas offline.

const SEM_INTERNET = "Sem internet: o primeiro acesso precisa de conexão.";
const MUITAS_TENTATIVAS = "Muitas tentativas de entrar agora nesta rede. Aguarde alguns minutos e tente de novo.";
// Ao abrir o app, quanto esperar o servidor antes de seguir com os dados guardados.
// Com sinal fraco o pedido pode nunca responder (nem com erro); sem limite, a tela
// ficava em branco. Mesmo valor do limite do env.js no sw.js.
const LIMITE_REDE_MS = 3000;

// Rejeita como falha de rede (TypeError) se a promessa não responder a tempo.
function comLimite(promessa, ms) {
  let relogio;
  const limite = new Promise((_, rejeitar) => {
    relogio = setTimeout(() => rejeitar(new TypeError("Failed to fetch: o servidor não respondeu a tempo")), ms);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(relogio));
}

export function criarAuth({ remoto, storage, estaOnline = () => navigator.onLine, limiteRedeMs = LIMITE_REDE_MS }) {
  let usuario = null;
  const ouvintes = new Set();
  const notificar = (u) => ouvintes.forEach((cb) => cb(u));

  remoto.aoMudarSessao?.((evento) => {
    if (evento === "SIGNED_OUT" && usuario) {
      usuario = null;
      notificar(null);
    }
  });

  // Junta ao usuário o nome do perfil. Sem conexão, usa o nome já guardado
  // deste mesmo usuário; nunca o de outra conta.
  // Também o papel (vistoriador | loja) e a loja da conta: definem as telas.
  async function comNome(u) {
    let perfil;
    try {
      if (!estaOnline()) throw new TypeError("offline"); // sem rede: nem tenta
      perfil = (await comLimite(remoto.obterPerfil(u.id), limiteRedeMs)) ?? null;
    } catch {
      const emCache = await storage.obterMeta("usuario");
      perfil = emCache?.id === u.id ? emCache : null;
    }
    return { ...u, nome: perfil?.nome ?? null, papel: perfil?.papel ?? "vistoriador", loja: perfil?.loja ?? null };
  }

  async function iniciar() {
    const { sessao, erro } = await comLimite(remoto.obterSessao(), limiteRedeMs).catch((e) => ({ sessao: null, erro: e }));
    if (sessao) {
      usuario = await comNome(sessao.usuario);
      await storage.salvarMeta("usuario", usuario);
      return usuario;
    }
    if (erro && remoto.classificarErro(erro, estaOnline()).tipo === "rede") {
      const emCache = await storage.obterMeta("usuario");
      if (emCache) {
        usuario = emCache;
        return usuario;
      }
    }
    usuario = null;
    return null;
  }

  async function entrar(email, senha) {
    if (!estaOnline()) throw new Error(SEM_INTERNET);
    let u;
    try {
      u = await remoto.entrar(String(email).trim(), senha);
    } catch (e) {
      if (e?.code === "invalid_credentials" || /invalid login credentials/i.test(e?.message ?? "")) {
        throw new Error("E-mail ou senha incorretos.");
      }
      // Limite do Supabase: logins por endereço de internet (todo o Wi-Fi do CD conta como um).
      if (e?.status === 429 || e?.code === "over_request_rate_limit") throw new Error(MUITAS_TENTATIVAS);
      if (remoto.classificarErro(e, estaOnline()).tipo === "rede") throw new Error(SEM_INTERNET);
      throw new Error("Não foi possível entrar. Tente novamente em instantes.");
    }
    usuario = await comNome(u);
    await storage.salvarMeta("usuario", usuario);
    notificar(usuario);
    return usuario;
  }

  // Rascunhos, pendentes e exclusões ficam guardados até o usuário entrar de novo.
  async function sair() {
    const u = usuario;
    try {
      await remoto.sair();
    } catch {
      // offline: o signOut({ scope: "local" }) já removeu a sessão do aparelho
    }
    if (u) await storage.limparCacheSincronizado(u.id);
    await storage.removerMeta("usuario");
    usuario = null;
    notificar(null);
  }

  return {
    iniciar,
    entrar,
    sair,
    usuarioAtual: () => usuario,
    aoMudar(cb) {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
  };
}
