// OPCIONAL — comando de build no Netlify: `node scripts/gerar-env.js`.
// Gera o env.js a partir das variáveis SUPABASE_URL e SUPABASE_ANON_KEY
// (Site settings → Environment variables) e carimba a CACHE_VERSION do sw.js,
// para cada deploy virar uma versão nova do app (aviso "Nova versão disponível").
// O caminho PADRÃO continua sendo editar o env.js à mão (veja o README).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function gerarEnv({ env, raiz }) {
  const url = env.SUPABASE_URL?.trim();
  const chave = env.SUPABASE_ANON_KEY?.trim();
  if (!url || !chave) {
    throw new Error("Defina SUPABASE_URL e SUPABASE_ANON_KEY em Site settings → Environment variables.");
  }
  fs.writeFileSync(
    path.join(raiz, "env.js"),
    "// Gerado por scripts/gerar-env.js no build do Netlify. Não edite aqui.\n"
      + `export const SUPABASE_URL = ${JSON.stringify(url)};\n`
      + `export const SUPABASE_ANON_KEY = ${JSON.stringify(chave)};\n`,
  );
  // COMMIT_REF existe nos builds do Netlify; sem ele, o horário em base 36.
  const versao = `v-${env.COMMIT_REF ? env.COMMIT_REF.slice(0, 8) : Date.now().toString(36).slice(-8)}`;
  const swPath = path.join(raiz, "sw.js");
  const sw = fs.readFileSync(swPath, "utf8");
  if (!/^const CACHE_VERSION = ".*";$/m.test(sw)) throw new Error("Linha CACHE_VERSION não encontrada em sw.js.");
  fs.writeFileSync(swPath, sw.replace(/^const CACHE_VERSION = ".*";$/m, `const CACHE_VERSION = "${versao}";`));
  return { versao };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
    const { versao } = gerarEnv({ env: process.env, raiz });
    console.log(`env.js gerado; CACHE_VERSION = ${versao}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
