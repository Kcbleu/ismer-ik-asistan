// Sunucu kodunu gerçek Gemini'ye bağlanmadan test eder: npm test
import worker, { kaynakAyikla } from "../src/worker.js";
import assert from "node:assert/strict";

let sonIstek = null;
let sahteCevap = { status: 200, body: { candidates: [{ content: { parts: [{ text: "Hayır, eşinizi dahil edemezsiniz.\n[SSS:4]" }] } }], usageMetadata: { totalTokenCount: 900 } } };
globalThis.fetch = async (url, opt) => {
  sonIstek = { url, opt, govde: JSON.parse(opt.body) };
  return new Response(JSON.stringify(sahteCevap.body), { status: sahteCevap.status });
};

let limitDurumu = true;
const env = {
  GEMINI_API_KEY: "test-anahtar",
  GEMINI_MODEL: "gemini-3.5-flash-lite",
  SOHBET_LIMIT: { limit: async () => ({ success: limitDurumu }) },
  ASSETS: { fetch: async () => new Response("asset") },
};
const istek = (govde, ek = {}) =>
  new Request("https://asistan.ornek.dev/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...(ek.headers || {}) },
    body: typeof govde === "string" ? govde : JSON.stringify(govde),
  });

const sonuc = [];
async function t(ad, fn) {
  try { await fn(); sonuc.push(["✓", ad]); } catch (e) { sonuc.push(["✗", ad + " → " + e.message]); }
}

await t("normal soru: cevap ve kaynak döner", async () => {
  const r = await worker.fetch(istek({ mesajlar: [{ rol: "kullanici", metin: "Eşimi ekleyebilir miyim?" }] }), env);
  const v = await r.json();
  assert.equal(r.status, 200);
  assert.equal(v.cevap, "Hayır, eşinizi dahil edemezsiniz.");
  assert.deepEqual(v.kaynaklar, [4]);
});

await t("anahtar URL'de değil başlıkta gider, model doğru", async () => {
  assert.ok(!sonIstek.url.includes("key="));
  assert.equal(sonIstek.opt.headers["x-goog-api-key"], "test-anahtar");
  assert.ok(sonIstek.url.includes("models/gemini-3.5-flash-lite:generateContent"));
});

await t("sistem talimatında SSS ve kurallar var", async () => {
  const s = sonIstek.govde.systemInstruction.parts[0].text;
  assert.ok(s.includes("Yalnızca aşağıdaki"));
  assert.ok(s.includes("Hangi evraklar gerekiyor?"));
  assert.ok(s.includes("Provizyon alamazsam") && s.includes("henüz eklenmedi"));
  assert.equal(sonIstek.govde.generationConfig.maxOutputTokens, 600);
});

await t("geçmiş son 6 mesajla sınırlı ve kullanıcıyla başlıyor", async () => {
  const mesajlar = [];
  for (let i = 0; i < 6; i++) { mesajlar.push({ rol: "kullanici", metin: "soru " + i }); mesajlar.push({ rol: "asistan", metin: "cevap " + i }); }
  mesajlar.push({ rol: "kullanici", metin: "son soru" });
  await worker.fetch(istek({ mesajlar }), env);
  const c = sonIstek.govde.contents;
  assert.ok(c.length <= 6);
  assert.equal(c[0].role, "user");
  assert.equal(c[c.length - 1].parts[0].text, "son soru");
});

await t("300 karakterden uzun soru reddedilir", async () => {
  const r = await worker.fetch(istek({ mesajlar: [{ rol: "kullanici", metin: "a".repeat(301) }] }), env);
  assert.equal(r.status, 400);
  assert.equal((await r.json()).hata, "uzun");
});

await t("dakika limiti aşılınca 429", async () => {
  limitDurumu = false;
  const r = await worker.fetch(istek({ mesajlar: [{ rol: "kullanici", metin: "merhaba" }] }), env);
  limitDurumu = true;
  assert.equal(r.status, 429);
});

await t("bozuk istek 400", async () => {
  const r = await worker.fetch(istek("{bozuk"), env);
  assert.equal(r.status, 400);
});

await t("son mesaj asistandan ise 400", async () => {
  const r = await worker.fetch(istek({ mesajlar: [{ rol: "asistan", metin: "x" }] }), env);
  assert.equal(r.status, 400);
});

await t("izin verilmeyen siteden çağrı 403", async () => {
  const r = await worker.fetch(istek({ mesajlar: [{ rol: "kullanici", metin: "x" }] }, { headers: { origin: "https://baska-site.com" } }), env);
  assert.equal(r.status, 403);
});

await t("izinli portal adresinden çağrı kabul", async () => {
  const r = await worker.fetch(istek({ mesajlar: [{ rol: "kullanici", metin: "x" }] }, { headers: { origin: "https://portal.ornek.com" } }), { ...env, IZINLI_KAYNAKLAR: "https://portal.ornek.com" });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), "https://portal.ornek.com");
});

await t("anahtar yoksa 500 'ayar'", async () => {
  const r = await worker.fetch(istek({ mesajlar: [{ rol: "kullanici", metin: "x" }] }), { ...env, GEMINI_API_KEY: "" });
  assert.equal((await r.json()).hata, "ayar");
});

await t("Gemini hata verirse 502, kota dolunca 503", async () => {
  sahteCevap = { status: 500, body: { error: "x" } };
  let r = await worker.fetch(istek({ mesajlar: [{ rol: "kullanici", metin: "x" }] }), env);
  assert.equal(r.status, 502);
  sahteCevap = { status: 429, body: {} };
  r = await worker.fetch(istek({ mesajlar: [{ rol: "kullanici", metin: "x" }] }), env);
  assert.equal(r.status, 503);
});

await t("kaynak etiketi ayıklama", async () => {
  assert.deepEqual(kaynakAyikla("Metin\n[SSS:1,7]"), { cevap: "Metin", kaynaklar: [1, 7] });
  assert.deepEqual(kaynakAyikla("Metin [SSS:yok]"), { cevap: "Metin", kaynaklar: [] });
  assert.deepEqual(kaynakAyikla("Metin [SSS:99]"), { cevap: "Metin", kaynaklar: [] });
  assert.deepEqual(kaynakAyikla("Etiketsiz"), { cevap: "Etiketsiz", kaynaklar: [] });
});

await t("diğer adresler dosya olarak sunulur", async () => {
  const r = await worker.fetch(new Request("https://asistan.ornek.dev/chat.html"), env);
  assert.equal(await r.text(), "asset");
});

for (const [d, ad] of sonuc) console.log(d, ad);
const hata = sonuc.filter(([d]) => d === "✗").length;
console.log(`\n${sonuc.length - hata}/${sonuc.length} test geçti`);
process.exit(hata ? 1 : 0);
