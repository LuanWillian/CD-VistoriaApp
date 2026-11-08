import { test } from "node:test";
import assert from "node:assert/strict";
import { recorte34, restricoesCamera, motivoErroCamera } from "../camera.js";
import { FOTO_CAMERA } from "../config.js";

test("saída da câmera: 3:4, 960×1280 (maior lado igual ao das fotos atuais), JPEG 0.92", () => {
  assert.deepEqual(FOTO_CAMERA, { largura: 960, altura: 1280, qualidade: 0.92 });
  assert.equal(FOTO_CAMERA.largura / FOTO_CAMERA.altura, 3 / 4);
});

test("recorte central 3:4 de um vídeo deitado (16:9)", () => {
  // 1920×1080: altura inteira, largura 810 no centro
  assert.deepEqual(recorte34(1920, 1080), { sx: 555, sy: 0, sw: 810, sh: 1080 });
});

test("recorte central 3:4 de um vídeo em pé mais alto que 3:4 (9:16)", () => {
  // 1080×1920: largura inteira, altura 1440 no centro
  assert.deepEqual(recorte34(1080, 1920), { sx: 0, sy: 240, sw: 1080, sh: 1440 });
});

test("vídeo que já é 3:4 não é cortado", () => {
  assert.deepEqual(recorte34(1440, 1920), { sx: 0, sy: 0, sw: 1440, sh: 1920 });
});

test("restrições do getUserMedia: traseira, 3/4, 1440×1920, sem áudio", () => {
  assert.deepEqual(restricoesCamera(), {
    audio: false,
    video: { facingMode: { ideal: "environment" }, aspectRatio: { ideal: 3 / 4 }, width: { ideal: 1440 }, height: { ideal: 1920 } },
  });
});

test("erros do getUserMedia viram motivos em português", () => {
  assert.equal(motivoErroCamera({ name: "NotAllowedError" }), "negada");
  assert.equal(motivoErroCamera({ name: "SecurityError" }), "negada");
  assert.equal(motivoErroCamera({ name: "NotFoundError" }), "sem-camera");
  assert.equal(motivoErroCamera({ name: "NotReadableError" }), "ocupada");
  assert.equal(motivoErroCamera({ name: "QualquerOutro" }), "indisponivel");
});
