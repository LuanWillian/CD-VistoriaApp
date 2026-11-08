// Login, sessão e saída. A sessão continua valendo offline: guardamos id e
// e-mail do usuário no banco local, e o token é renovado quando a internet volta
// (o supabase-js não apaga a sessão salva quando a renovação falha por rede).

const SEM_INTERNET = "Sem internet: o primeiro acesso precisa de conexão.";

export function criarAuth({ remoto, storage, estaOnline = () => navigator.onLine }) {
  let usuario = null;
  const ouvintes = new Set();
  const notificar = (u) => ouvintes.forEach((cb) => cb(u));

  remoto.aoMudarSessao?.((evento) => {
    if (evento === "SIGNED_OUT" && usuario) {
      usuario = null;
      notificar(null);
    }
  });

  async function iniciar() {
    const { sessao, erro } = await remoto.obterSessao().catch((e) => ({ sessao: null, erro: e }));
    if (sessao) {
      usuario = sessao.usuario;
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
      if (remoto.classificarErro(e, estaOnline()).tipo === "rede") throw new Error(SEM_INTERNET);
      throw new Error("Não foi possível entrar. Tente novamente em instantes.");
    }
    usuario = u;
    await storage.salvarMeta("usuario", u);
    notificar(u);
    return u;
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
