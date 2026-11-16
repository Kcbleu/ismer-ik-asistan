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
// Cevabı personel grubuna göre değişen maddenin cevabı gruplar listesindedir
const cevapli = (k) => Boolean(k.cevap || (k.gruplar || []).length);
// Doğru madde bulundu: cevap verildi ya da cevap gruba göre değiştiği için önce grup soruldu
const bulundu = (r) => r.tur === "cevap" || r.tur === "grup_sor";

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
t("harf farkı sayımı (eksik, yer değiştirme, d/t yumuşaması, klavye yakınlığı)", () => {
  assert.equal(mesafe("sigorta", "sgorta"), 1);    // eksik harf
  assert.equal(mesafe("bordro", "bordor"), 1);     // yer değiştirme
  assert.equal(mesafe("kaybet", "kaybed"), 0.5);   // ses yumuşaması
  assert.equal(mesafe("izin", "izim"), 0.75);      // klavyede yan yana (n/m)
  assert.equal(mesafe("kaybet", "kayben"), 1.25);  // klavyede uzak (t/n)
});
t("gerçek kelimeler birbirine karıştırılmaz (babalık izni cenaze izni değildir)", () => {
  for (const q of ["babalık izni kaç gün", "baba olan çalışana izin var mı", "hangi telefonu alayım", "yemek kartı limiti ne kadar"]) {
    assert.notEqual(motor.cevapla(q).tur, "cevap", q);
  }
});
t("listeden seçilen her soru kendi cevabını getirir", () => {
  for (const k of SSS) {
    const r = motor.cevapla(k.soru);
    assert.ok(r.kaynaklar.includes(k.id) || (!cevapli(k) && r.tur === "bos"), `${k.id}. soru: ${r.tur} ${r.kaynaklar}`);
  }
});
t("cevabı boş madde İK'ya yönlendirir", () => {
  const bos = SSS.find((k) => !cevapli(k));
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

// Personel grubu: kalan izin banka PDH personelinde İzin Yönetim Sistemi'nden, ofis personelinde Bilişim HR'dan
const gruplu = SSS.find((k) => (k.gruplar || []).length > 1);
if (gruplu) {
  const [g1, g2] = gruplu.gruplar;
  const cevabi = (ad) => gruplu.gruplar.find((g) => g.ad === ad).cevap;
  t("cevabı gruba göre değişen soruda grup bilinmiyorsa önce grup sorulur", () => {
    const r = motor.cevapla(gruplu.soru);
    assert.equal(r.tur, "grup_sor");
    assert.deepEqual(r.kaynaklar, [gruplu.id]);
    assert.deepEqual(r.secenekler.map((s) => s.ad), gruplu.gruplar.map((g) => g.ad));
  });
  t("grup biliniyorsa o grubun cevabı verilir", () => {
    for (const g of [g1, g2]) {
      const r = motor.cevapla(gruplu.soru, { grup: g.ad });
      assert.equal(r.tur, "cevap");
      assert.equal(r.metin, g.cevap);
      assert.equal(r.grup, g.ad);
    }
  });
  t("mesajda yazılan grup anlaşılır ve sorudan çıkarılır", () => {
    const ofis = motor.cevapla("ofis personeliyim kaç gün iznim kaldı");
    assert.equal(ofis.tur, "cevap");
    assert.equal(ofis.metin, cevabi("Ofis personeli"));
    assert.equal(ofis.grup, "Ofis personeli");
    const banka = motor.cevapla("bankada çalışıyorum kalan iznimi nerden görürüm", { grup: "Ofis personeli" });
    assert.equal(banka.metin, cevabi("Banka PDH personeli"), "mesajda yazılan grup hatırlanandan önce gelir");
    assert.equal(motor.cevapla("pdh personeli kalan izin").grup, "Banka PDH personeli");
  });
  t("yalnızca grup yazılırsa önceki soru o grup için cevaplanır", () => {
    const r = motor.cevapla("peki ofis personeli için?", { onceki: gruplu.id, grup: "Banka PDH personeli" });
    assert.equal(r.metin, cevabi("Ofis personeli"));
    const s = motor.cevapla("ofis personeliyim", { onceki: 20 });
    assert.equal(s.tur, "sohbet");
    assert.equal(s.grup, "Ofis personeli");
  });
  t("grup kelimeleri gruba göre değişmeyen soruları bozmaz", () => {
    assert.deepEqual(motor.cevapla("ofis personeliyim bordroma nasıl ulaşırım").kaynaklar, [20]);
    assert.deepEqual(motor.cevapla("şubem kapanacak ne yapmalıyım", { grup: "Ofis personeli" }).kaynaklar, [29]);
  });
}
t("grup anahtar kelimeleri SSS sorularında ve alternatif ifadelerde geçmez (geçerse sorudan silinirdi)", () => {
  const anahtar = (bilgi.gruplar || []).flatMap((g) => g.kelimeler.map((k) => [g.ad, sade(k)]));
  const cakisan = [];
  for (const k of SSS) for (const ifade of [k.soru, ...(k.alternatifler || [])]) {
    const kel = sade(ifade).split(" ");
    for (const [ad, a] of anahtar) if (kel.some((w) => w.startsWith(a))) cakisan.push(`${k.id}: "${ifade}" ↔ ${ad}: ${a}`);
  }
  assert.ok(!cakisan.length, "\n    " + cakisan.join("\n    "));
});

// ---------- 2) Alternatif ifadeler kendi maddesini bulmalı ----------
const altHata = [];
for (const k of SSS) for (const a of k.alternatifler || []) {
  // Birebir eşleşmeyi atlamak için noktalama değiştirilir; asıl kontrol puanlamanın kendisi
  const r = motor.cevapla(a + " lütfen");
  const ok = r.kaynaklar.includes(k.id) || (!cevapli(k) && r.tur === "bos");
  if (!ok) altHata.push(`${k.id}: "${a}" → ${r.tur} ${r.kaynaklar.concat(r.oneriler).join(",")}`);
}
t("her alternatif ifade kendi maddesine gider", () => assert.ok(!altHata.length, "\n    " + altHata.join("\n    ")));

// ---------- 3) Test soruları ve sohbet senaryoları (data/test_sorular.xlsx) ----------
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(new URL("../data/test_sorular.xlsx", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
const hucre = (r, n) => String(r.getCell(n).text || "").trim();

// Sonucu beklenenle karşılaştırır: "dogru" | "oneri" (doğru madde öneri listesinde) | "hata"
function degerlendir(r, bek) {
  if (bek === "-") {
    // SSS'de cevabı yok: doğrudan cevap verilmemeli. "Bunu mu soruyorsunuz?" diye sorması kabul edilir.
    return bulundu(r) || r.tur === "bos" ? "hata" : r.tur === "oneri" ? "oneri" : "dogru";
  }
  if (sohbetTurleri.has(bek)) return r.tur === "sohbet" && r.metin === bilgi.sohbet.find((s) => s.tur === bek).cevap ? "dogru" : "hata";
  const kabul = bek.split(/[,\s]+/).map(Number);
  if (bulundu(r)) return kabul.some((n) => r.kaynaklar.includes(n)) ? "dogru" : "hata";
  if (r.tur === "bos") return kabul.some((n) => !cevapli(SSS.find((k) => k.id === n) || {})) ? "dogru" : "hata";
  return r.tur === "oneri" && r.oneriler.some((n) => kabul.includes(n)) ? "oneri" : "hata";
}
const ozet = (soru, bek, r) => `"${soru}" → beklenen ${bek}, sonuç ${r.tur} ${r.kaynaklar.concat(r.oneriler).join(",")}`;
const oneriListesi = [];

const testler = [];
wb.getWorksheet("Test").eachRow((r, i) => { if (i > 1 && hucre(r, 1) && hucre(r, 2)) testler.push([hucre(r, 1), hucre(r, 2)]); });
const sayac = { dogru: 0, oneri: 0 }, testHata = [];
for (const [soru, bek] of testler) {
  const r = motor.cevapla(soru), s = degerlendir(r, bek);
  if (s === "hata") testHata.push(ozet(soru, bek, r)); else sayac[s]++;
  if (s === "oneri") oneriListesi.push(ozet(soru, bek, r));
}
t(`test soruları: ${testler.length} sorudan ${sayac.dogru} doğrudan doğru, ${sayac.oneri} öneride`, () => assert.ok(!testHata.length, "\n    " + testHata.join("\n    ")));

// Senaryolar: aynı numaralı mesajlar tek sohbette sırayla yazılır, önceki cevap bağlam olur
const senaryolar = new Map();
wb.getWorksheet("Senaryolar")?.eachRow((r, i) => {
  if (i > 1 && hucre(r, 1) && hucre(r, 2) && hucre(r, 3)) {
    if (!senaryolar.has(hucre(r, 1))) senaryolar.set(hucre(r, 1), []);
    senaryolar.get(hucre(r, 1)).push([hucre(r, 2), hucre(r, 3)]);
  }
});
const sSayac = { dogru: 0, oneri: 0, adim: 0 }, sHata = [];
for (const [no, adimlar] of senaryolar) {
  let onceki = null;
  for (const [soru, bek] of adimlar) {
    const r = motor.cevapla(soru, { onceki });
    if (r.kaynaklar.length) onceki = r.kaynaklar[0];
    const s = degerlendir(r, bek);
    sSayac.adim++;
    if (s === "hata") sHata.push(`senaryo ${no}: ` + ozet(soru, bek, r)); else sSayac[s]++;
  }
}
t(`sohbet senaryoları: ${senaryolar.size} senaryo, ${sSayac.adim} mesajdan ${sSayac.dogru} doğrudan doğru, ${sSayac.oneri} öneride`, () => assert.ok(!sHata.length, "\n    " + sHata.join("\n    ")));

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
for (const k of SSS.filter(cevapli)) for (let d = 0; d < 10; d++) {
  const kel = sade(k.soru).split(" ");
  for (let x = 1 + Math.floor(rnd() * 2); x > 0; x--) { const j = Math.floor(rnd() * kel.length); kel[j] = boz(kel[j]); }
  const r = motor.cevapla(kel.join(" "));
  oto.n++;
  if (bulundu(r)) { if (r.kaynaklar[0] === k.id) oto.dogru++; else { oto.yanlis++; otoYanlis.push(`"${kel.join(" ")}" → ${r.kaynaklar} (beklenen ${k.id})`); } }
  else if (r.tur === "oneri" && r.oneriler.includes(k.id)) oto.oneri++;
  else { oto.kayip++; otoKayip.push(`"${kel.join(" ")}" → ${r.tur} ${r.oneriler} (beklenen ${k.id})`); }
}
const yuzde = (x) => "%" + ((100 * x) / oto.n).toFixed(1);
t(`otomatik ${oto.n} bozuk soru: doğrudan ${yuzde(oto.dogru)}, öneride ${yuzde(oto.oneri)}, yanlış ${yuzde(oto.yanlis)}, kayıp ${yuzde(oto.kayip)}`, () =>
  assert.ok(oto.yanlis / oto.n <= 0.01, "yanlış cevap oranı %1'in üstünde:\n    " + otoYanlis.join("\n    ")));

for (const [d, ad] of sonuc) console.log(d, ad);
// Öneriye düşen sorular uzun bir liste olabilir: yalnızca istenirse yazılır (npm test -- --detay)
if (oneriListesi.length && process.argv.includes("--detay")) console.log("\nÖneri listesiyle cevaplananlar (doğru madde listede):\n  " + oneriListesi.join("\n  "));
else if (oneriListesi.length) console.log(`\n${oneriListesi.length} soru öneri listesiyle cevaplandı (ayrıntı: npm test -- --detay)`);
if (otoYanlis.length) console.log("\nOtomatik testte yanlış cevaplananlar (sınır %1):\n  " + otoYanlis.join("\n  "));
if (otoKayip.length) console.log("\nOtomatik testte bulunamayanlar:\n  " + otoKayip.join("\n  "));
console.log(hataVar ? "\nBazı testler geçmedi." : "\nTüm testler geçti.");
process.exit(hataVar ? 1 : 0);
