// Eşleştiriciyi test eder: npm test
// 1) Temel kurallar  2) Her SSS sorusu ve alternatif ifadesi kendi maddesini bulmalı
// 3) data/test_sorular.xlsx'teki sorular  4) SSS sorularından otomatik üretilen yazım hataları
import "../public/eslestirici.js";
import ExcelJS from "exceljs";
import assert from "node:assert/strict";
import fs from "node:fs";

const { kur, sade, mesafe } = globalThis.Eslestirici;
const bilgi = JSON.parse(fs.readFileSync(new URL("../public/sss.json", import.meta.url), "utf8"));
const motor = kur(bilgi);
const SSS = bilgi.sorular;
const sohbetTurleri = new Set(bilgi.sohbet.map((s) => s.tur));

const sonuc = [];
let hataVar = false;
function t(ad, fn) {
  try { fn(); sonuc.push(["✓", ad]); } catch (e) { hataVar = true; sonuc.push(["✗", ad + " → " + e.message]); }
}

// ---------- 1) Temel kurallar ----------
t("Türkçe harfler sadeleşir, harf uzatma kısalır", () => {
  assert.equal(sade("İZİNLERİM Çok ÖNEMLİ"), "izinlerim cok onemli");
  assert.equal(sade("izinnnnn??"), "izinn");
  assert.equal(sade("e-posta şifrem"), "eposta sifrem");
});
t("harf farkı sayımı (eksik, yer değiştirme, d/t yumuşaması)", () => {
  assert.equal(mesafe("sigorta", "sgorta"), 1);
  assert.equal(mesafe("bordro", "bordor"), 1);
  assert.equal(mesafe("kaybet", "kayben"), 1);
  assert.equal(mesafe("kaybet", "kaybed"), 0.5);
});
t("listeden seçilen her soru kendi cevabını getirir", () => {
  for (const k of SSS) {
    const r = motor.cevapla(k.soru);
    assert.ok(r.kaynaklar.includes(k.id) || (!k.cevap && r.tur === "bos"), `${k.id}. soru: ${r.tur} ${r.kaynaklar}`);
  }
});
t("cevabı boş madde İK'ya yönlendirir", () => {
  const bos = SSS.find((k) => !k.cevap);
  if (!bos) return;
  const r = motor.cevapla(bos.soru);
  assert.equal(r.tur, "bos");
  assert.ok(r.metin.includes("@"));
});
t("Giriş cümlesi cevabın başına eklenir", () => {
  const k = SSS.find((x) => x.giris && x.cevap);
  if (!k) return;
  assert.ok(motor.cevapla(k.soru).metin.startsWith(k.giris));
});
t("kısa takip sorusu önceki konuyla birlikte anlaşılır", () => {
  const r = motor.cevapla("peki eşim?", { onceki: 1 });
  assert.equal(r.tur, "cevap");
  assert.deepEqual(r.kaynaklar, [4]);
});
t("takip sorusu önceki sorunun konusunu taşır (yemek kartı kaybı → İstanbulkart)", () => {
  assert.deepEqual(motor.cevapla("peki istanbul kart?", { onceki: 24 }).kaynaklar, [25]);
});
t("SSS'de olmayan soruya yakın maddenin cevabı verilmez", () => {
  for (const q of ["yeni işe başladım yemek kartı ne zaman verilir", "kart aidatı", "en yakın eczane", "araba sigortası ne kadar"]) {
    assert.notEqual(motor.cevapla(q).tur, "cevap", q);
  }
});
t("selam + soru: soru cevaplanır", () => {
  assert.equal(motor.cevapla("iyi günler, bordromu nereden görürüm").tur, "cevap");
});

// ---------- 2) Alternatif ifadeler kendi maddesini bulmalı ----------
const altHata = [];
for (const k of SSS) for (const a of k.alternatifler || []) {
  // Birebir eşleşmeyi atlamak için noktalama değiştirilir; asıl kontrol puanlamanın kendisi
  const r = motor.cevapla(a + " lütfen");
  const ok = r.kaynaklar.includes(k.id) || (!k.cevap && r.tur === "bos");
  if (!ok) altHata.push(`${k.id}: "${a}" → ${r.tur} ${r.kaynaklar.concat(r.oneriler).join(",")}`);
}
t("her alternatif ifade kendi maddesine gider", () => assert.ok(!altHata.length, "\n    " + altHata.join("\n    ")));

// ---------- 3) Test soruları (data/test_sorular.xlsx) ----------
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(new URL("../data/test_sorular.xlsx", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
const testler = [];
wb.worksheets[0].eachRow((r, i) => {
  const soru = String(r.getCell(1).text || "").trim(), bek = String(r.getCell(2).text || "").trim();
  if (i > 1 && soru && bek) testler.push([soru, bek]);
});
const sayac = { dogru: 0, oneride: 0 };
const testHata = [], oneriListesi = [];
for (const [soru, bek] of testler) {
  const r = motor.cevapla(soru);
  const ozet = `"${soru}" → beklenen ${bek}, sonuç ${r.tur} ${r.kaynaklar.concat(r.oneriler).join(",")}`;
  if (bek === "-") {
    // SSS'de cevabı yok: doğrudan cevap verilmemeli. "Bunu mu soruyorsunuz?" diye sorması kabul edilir.
    if (r.tur === "cevap" || r.tur === "bos") testHata.push(ozet);
    else if (r.tur === "oneri") { sayac.oneride++; oneriListesi.push(ozet); }
    else sayac.dogru++;
  } else if (sohbetTurleri.has(bek)) {
    r.tur === "sohbet" && r.metin === bilgi.sohbet.find((s) => s.tur === bek).cevap ? sayac.dogru++ : testHata.push(ozet);
  } else {
    const kabul = bek.split(/[,\s]+/).map(Number);
    if (r.tur === "cevap" || r.tur === "bos") (kabul.some((n) => r.kaynaklar.includes(n)) || (r.tur === "bos" && kabul.some((n) => !SSS.find((k) => k.id === n)?.cevap))) ? sayac.dogru++ : testHata.push(ozet);
    else if (r.tur === "oneri" && r.oneriler.some((n) => kabul.includes(n))) { sayac.oneride++; oneriListesi.push(ozet); }
    else testHata.push(ozet);
  }
}
t(`test soruları: ${testler.length} sorudan ${sayac.dogru} doğrudan doğru, ${sayac.oneride} öneride`, () => assert.ok(!testHata.length, "\n    " + testHata.join("\n    ")));

// ---------- 4) Otomatik yazım hataları ----------
const KOMSU = { q: "wa", w: "qes", e: "wrd", r: "etf", t: "ryg", y: "tuh", u: "yij", i: "uok", o: "ipl", p: "o", a: "qsz", s: "adw", d: "sfe", f: "dgr", g: "fht", h: "gjy", j: "hku", k: "jli", l: "k", z: "xa", x: "zc", c: "xv", v: "cb", b: "vn", n: "bm", m: "n" };
let tohum = 42;
const rnd = () => ((tohum = (tohum * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
function boz(w) {
  if (w.length < 4) return w;
  const i = 1 + Math.floor(rnd() * (w.length - 2));
  switch (Math.floor(rnd() * 4)) {
    case 0: return w.slice(0, i) + w.slice(i + 1);                    // harf düşer
    case 1: return w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);  // iki harf yer değiştirir
    case 2: { const k = KOMSU[w[i]]; return k ? w.slice(0, i) + k[Math.floor(rnd() * k.length)] + w.slice(i + 1) : w; } // yan tuş
    default: return w.slice(0, i) + w[i] + w.slice(i);                // harf tekrarlanır
  }
}
const oto = { n: 0, dogru: 0, oneri: 0, yanlis: 0, kayip: 0 };
const otoYanlis = [], otoKayip = [];
for (const k of SSS.filter((x) => x.cevap)) for (let d = 0; d < 10; d++) {
  const kel = sade(k.soru).split(" ");
  for (let x = 1 + Math.floor(rnd() * 2); x > 0; x--) { const j = Math.floor(rnd() * kel.length); kel[j] = boz(kel[j]); }
  const r = motor.cevapla(kel.join(" "));
  oto.n++;
  if (r.tur === "cevap") { if (r.kaynaklar[0] === k.id) oto.dogru++; else { oto.yanlis++; otoYanlis.push(`"${kel.join(" ")}" → ${r.kaynaklar} (beklenen ${k.id})`); } }
  else if (r.tur === "oneri" && r.oneriler.includes(k.id)) oto.oneri++;
  else { oto.kayip++; otoKayip.push(`"${kel.join(" ")}" → ${r.tur} ${r.oneriler} (beklenen ${k.id})`); }
}
const yuzde = (x) => "%" + ((100 * x) / oto.n).toFixed(1);
t(`otomatik ${oto.n} bozuk soru: doğrudan ${yuzde(oto.dogru)}, öneride ${yuzde(oto.oneri)}, yanlış ${yuzde(oto.yanlis)}, kayıp ${yuzde(oto.kayip)}`, () =>
  assert.ok(oto.yanlis / oto.n <= 0.01, "yanlış cevap oranı %1'in üstünde:\n    " + otoYanlis.join("\n    ")));

for (const [d, ad] of sonuc) console.log(d, ad);
if (oneriListesi.length) console.log("\nÖneri listesiyle cevaplananlar (doğru madde listede):\n  " + oneriListesi.join("\n  "));
if (otoYanlis.length) console.log("\nOtomatik testte yanlış cevaplananlar (sınır %1):\n  " + otoYanlis.join("\n  "));
if (otoKayip.length) console.log("\nOtomatik testte bulunamayanlar:\n  " + otoKayip.join("\n  "));
console.log(hataVar ? "\nBazı testler geçmedi." : "\nTüm testler geçti.");
process.exit(hataVar ? 1 : 0);
