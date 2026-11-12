import { teste, igual, ok } from "./runner.js";
import * as st from "../../storage.js";
import { novoRascunho } from "../../formatos.js";

const dia = 24 * 60 * 60 * 1000;
const iso = (msAtras) => new Date(Date.now() - msAtras).toISOString();
const blob = (texto = "x", type = "image/jpeg") => new Blob([texto], { type });

function vistoria(id, userId, extra = {}) {
  return {
    id, userId, numero: null, realizadaEm: iso(0), chassi: "AB123C", marca: "Fiat", modelo: "Uno", cor: "Prata",
    km: 1, combustivel: "Flex", checklist: {}, checklistObs: "", semAvarias: true, avarias: [],
    vistoriadorNome: "Ana", motoristaNome: "Beto", status: "pendente", erro: null, enviados: [], origem: "local",
    completa: true, avariasQtd: 0, arquivosSalvosEm: iso(0), atualizadoEm: iso(0), ...extra,
  };
}

teste("storage: rascunho salvo e listado por usuário, mais recente primeiro", async () => {
  await st.apagarBanco();
  const r1 = novoRascunho("u1", "r1", iso(2000));
  const r2 = novoRascunho("u1", "r2", iso(1000));
  const r3 = novoRascunho("u2", "r3", iso(0));
  await st.salvarRascunho(r1);
  await st.salvarRascunho(r2);
  await st.salvarRascunho(r3);
  igual(await st.obterRascunho("r1"), r1);
  igual((await st.listarRascunhos("u1")).map((r) => r.id), ["r2", "r1"]);
});

teste("storage: arquivos por prefixo exato do id", async () => {
  await st.apagarBanco();
  await st.salvarArquivo("v1/frente.jpg", blob("abc"));
  await st.salvarArquivo("v1/chassi.jpg", blob("d"));
  await st.salvarArquivo("v10/frente.jpg", blob("e"));
  const b = await st.obterArquivo("v1/frente.jpg");
  igual(b.size, 3);
  igual(b.type, "image/jpeg");
  await st.excluirArquivos("v1");
  igual(await st.obterArquivo("v1/frente.jpg"), undefined);
  igual(await st.obterArquivo("v1/chassi.jpg"), undefined);
  ok(await st.obterArquivo("v10/frente.jpg"), "v10 não deveria ser apagado");
  await st.excluirArquivo("v10/frente.jpg");
  igual(await st.obterArquivo("v10/frente.jpg"), undefined);
});

teste("storage: finalizar rascunho cria vistoria pendente e mantém os arquivos", async () => {
  await st.apagarBanco();
  const r = novoRascunho("u1", "v1", iso(0));
  Object.assign(r.dados, { chassi: "AB123C", marca: "Fiat", modelo: "Uno", cor: "Prata", km: 10, combustivel: "Flex" });
  await st.salvarRascunho(r);
  await st.salvarArquivo("v1/frente.jpg", blob());
  const quando = new Date().toISOString();
  const v = await st.finalizarRascunho(r, quando);
  igual(v.status, "pendente");
  igual((await st.obterVistoria("v1")).realizadaEm, quando);
  igual(await st.obterRascunho("v1"), undefined);
  ok(await st.obterArquivo("v1/frente.jpg"), "arquivo sumiu");
});

teste("storage: sair limpa só as sincronizadas do usuário", async () => {
  await st.apagarBanco();
  await st.salvarVistoria(vistoria("s1", "u1", { status: "sincronizada", numero: "VIS-000001" }));
  await st.salvarVistoria(vistoria("p1", "u1", { status: "pendente" }));
  await st.salvarVistoria(vistoria("e1", "u1", { status: "erro" }));
  await st.salvarVistoria(vistoria("s2", "u2", { status: "sincronizada" }));
  await st.salvarArquivo("s1/frente.jpg", blob());
  await st.salvarArquivo("p1/frente.jpg", blob());
  await st.limparCacheSincronizado("u1");
  igual(await st.obterVistoria("s1"), undefined);
  igual(await st.obterArquivo("s1/frente.jpg"), undefined);
  ok(await st.obterVistoria("p1"), "pendente sumiu");
  ok(await st.obterArquivo("p1/frente.jpg"), "foto da pendente sumiu");
  ok(await st.obterVistoria("e1"), "erro sumiu");
  // Todos veem tudo: as cópias de outras pessoas também saem do aparelho (o servidor tem todas).
  igual(await st.obterVistoria("s2"), undefined, "a sincronizada de outro usuário deveria sair também");
});

teste("storage: listarSincronizadas devolve as já enviadas, de qualquer usuário", async () => {
  await st.apagarBanco();
  await st.salvarVistoria(vistoria("a", "u1", { status: "sincronizada", realizadaEm: iso(dia) }));
  await st.salvarVistoria(vistoria("b", "u2", { status: "sincronizada" }));
  await st.salvarVistoria(vistoria("c", "u2", { status: "pendente" }));
  igual((await st.listarSincronizadas()).map((v) => v.id), ["b", "a"]);
});

teste("storage: fotos antigas só de sincronizadas com mais de N dias", async () => {
  await st.apagarBanco();
  await st.salvarVistoria(vistoria("velha", "u1", { status: "sincronizada", arquivosSalvosEm: iso(31 * dia) }));
  await st.salvarVistoria(vistoria("nova", "u1", { status: "sincronizada", arquivosSalvosEm: iso(29 * dia) }));
  await st.salvarVistoria(vistoria("pend", "u1", { status: "pendente", arquivosSalvosEm: iso(90 * dia) }));
  for (const id of ["velha", "nova", "pend"]) await st.salvarArquivo(`${id}/frente.jpg`, blob());
  await st.limparFotosAntigas(30, new Date());
  igual(await st.obterArquivo("velha/frente.jpg"), undefined);
  ok(await st.obterArquivo("nova/frente.jpg"), "a de 29 dias perdeu a foto");
  ok(await st.obterArquivo("pend/frente.jpg"), "a pendente perdeu a foto");
  igual((await st.obterVistoria("velha")).arquivosSalvosEm, null);
});

teste("storage: listar vistorias por usuário, mais recente primeiro", async () => {
  await st.apagarBanco();
  await st.salvarVistoria(vistoria("a", "u1", { realizadaEm: iso(2 * dia) }));
  await st.salvarVistoria(vistoria("b", "u1", { realizadaEm: iso(dia) }));
  await st.salvarVistoria(vistoria("c", "u2"));
  igual((await st.listarVistorias("u1")).map((v) => v.id), ["b", "a"]);
  await st.excluirVistoriaLocal("b");
  igual((await st.listarVistorias("u1")).map((v) => v.id), ["a"]);
});

teste("storage: fila de exclusões e meta", async () => {
  await st.apagarBanco();
  await st.enfileirarExclusao({ id: "v9", userId: "u1", criadoEm: iso(0) });
  await st.enfileirarExclusao({ id: "v8", userId: "u2", criadoEm: iso(0) });
  igual((await st.listarExclusoes("u1")).map((e) => e.id), ["v9"]);
  await st.removerExclusao("v9");
  igual(await st.listarExclusoes("u1"), []);
  await st.salvarMeta("usuario", { id: "u1", email: "a@b" });
  igual(await st.obterMeta("usuario"), { id: "u1", email: "a@b" });
  await st.removerMeta("usuario");
  igual(await st.obterMeta("usuario"), undefined);
});

teste("storage: guardarSeAusentes grava de uma vez só as que faltam e não mexe nas existentes", async () => {
  await st.apagarBanco();
  await st.salvarVistoria({ id: "a", userId: "u1", realizadaEm: "2026-11-01T10:00:00.000Z", status: "pendente", marca: "Local" });
  const muitas = Array.from({ length: 1500 }, (_, i) => ({ id: i ? `r${i}` : "a", userId: "u2", realizadaEm: "2026-11-02T10:00:00.000Z", status: "sincronizada", marca: "Remota" }));
  await st.guardarSeAusentes(muitas);
  igual((await st.obterVistoria("a")).marca, "Local", "a vistoria do aparelho não pode ser sobrescrita");
  igual((await st.obterVistoria("r1499")).marca, "Remota");
  igual((await st.listarSincronizadas()).length, 1499);
});

teste("storage: rascunho do recebimento é salvo, lido e apagado junto com os arquivos", async () => {
  await st.apagarBanco();
  const dados = { id: "r1", status: "divergencia", descricao: "Risco", fotos: ["f1"], assinatura: true };
  await st.salvarRascunhoRecebimento("v1", dados);
  await st.salvarArquivo("receb-v1/receb_assinatura.png", blob("a", "image/png"));
  await st.salvarArquivo("receb-v1/receb_f1.jpg", blob("f"));
  await st.salvarArquivo("v1/frente.jpg", blob("vistoria"));
  igual(await st.obterRascunhoRecebimento("v1"), dados);
  igual(await st.obterRascunhoRecebimento("v2"), undefined);
  await st.excluirRascunhoRecebimento("v1");
  igual(await st.obterRascunhoRecebimento("v1"), undefined);
  igual(await st.obterArquivo("receb-v1/receb_assinatura.png"), undefined);
  igual(await st.obterArquivo("receb-v1/receb_f1.jpg"), undefined);
  ok(await st.obterArquivo("v1/frente.jpg"), "o arquivo da vistoria não pode ser apagado junto");
});
