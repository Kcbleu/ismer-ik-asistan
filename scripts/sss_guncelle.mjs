// SSS Excel dosyasını (data/sss.xlsx) sohbet ekranının okuyacağı public/sss.json dosyasına çevirir.
// Kullanım: npm run sss
//
// Sayfalar (sütunlar başlık adına göre okunur, sıraları önemli değil):
//   SSS              : No, Kategori, Soru, Cevap, Alternatif İfadeler, Giriş, Personel Grubu
//   Sözlük           : Kavram, Kelimeler (virgülle)
//   Sohbet           : Tür, İfadeler (her biri ayrı satırda), Cevap
//   Personel Grupları: Grup, Seçenek, Anahtar Kelimeler (virgülle)
//
// Cevabı personel grubuna göre değişen soruda her grup ayrı satırdır ve satırlar aynı No'yu taşır.
// Kategori, Soru, Alternatif İfadeler ve Giriş ilk satırdan okunur; sonraki satırlarda boş bırakılabilir.
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KAYNAK = path.join(KOK, "data", "sss.xlsx");
const HEDEF = path.join(KOK, "public", "sss.json");

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(KAYNAK);

const yazi = (h) => (h && h.value != null ? String(h.text ?? "").trim() : "");
const satirlar = (metin) => metin.split(/\r?\n|;/).map((s) => s.trim()).filter(Boolean);
const uyarilar = [];

// Sayfayı başlık satırına göre nesne listesine çevirir
function oku(ad, zorunlu) {
  const ws = wb.getWorksheet(ad);
  if (!ws) return [];
  const sutun = {};
  ws.getRow(1).eachCell((h, i) => { sutun[yazi(h)] = i; });
  for (const b of zorunlu) if (!sutun[b]) throw new Error(`"${ad}" sayfasında "${b}" sütunu bulunamadı.`);
  const out = [];
  ws.eachRow((r, i) => {
    if (i === 1) return;
    const o = { _satir: i };
    for (const [b, n] of Object.entries(sutun)) o[b] = r.getCell(n);
    out.push(o);
  });
  return out;
}

const gruplar = oku("Personel Grupları", ["Grup", "Seçenek", "Anahtar Kelimeler"])
  .map((r) => ({ ad: yazi(r.Grup), secenek: yazi(r["Seçenek"]), kelimeler: yazi(r["Anahtar Kelimeler"]).split(",").map((s) => s.trim()).filter(Boolean) }))
  .filter((g) => g.ad && g.kelimeler.length);
const grupAdlari = new Set(gruplar.map((g) => g.ad));

const sorular = [];
const noIle = new Map();
for (const r of oku("SSS", ["No", "Kategori", "Soru", "Cevap"])) {
  const soru = yazi(r.Soru);
  const no = Number(r.No.result ?? r.No.value);
  const grup = r["Personel Grubu"] ? yazi(r["Personel Grubu"]) : "";
  if (!Number.isInteger(no) || no <= 0) continue; // boş satırlar, alttaki özet tablosu ve notlar
  if (grup && !grupAdlari.has(grup)) uyarilar.push(`SSS ${r._satir}. satır: "${grup}" Personel Grupları sayfasında yok.`);
  const onceki = noIle.get(no);
  if (onceki) {
    // Aynı No'lu ikinci satır: aynı sorunun başka bir personel grubuna ait cevabı
    if (!grup || !onceki.gruplar) { uyarilar.push(`SSS ${r._satir}. satır: No ${no} birden fazla kez kullanılmış, atlandı (aynı sorunun farklı grup cevabıysa Personel Grubu'nu doldurun).`); continue; }
    if (onceki.gruplar.some((g) => g.ad === grup)) { uyarilar.push(`SSS ${r._satir}. satır: No ${no} için "${grup}" iki kez yazılmış, atlandı.`); continue; }
    onceki.gruplar.push({ ad: grup, cevap: yazi(r.Cevap) });
    continue;
  }
  if (!soru) continue;
  const k = {
    id: no,
    kategori: yazi(r.Kategori),
    soru,
    cevap: grup ? "" : yazi(r.Cevap),
    alternatifler: r["Alternatif İfadeler"] ? satirlar(yazi(r["Alternatif İfadeler"])) : [],
    giris: r["Giriş"] ? yazi(r["Giriş"]) : "",
  };
  if (grup) k.gruplar = [{ ad: grup, cevap: yazi(r.Cevap) }];
  noIle.set(no, k);
  sorular.push(k);
}
if (!sorular.length) { console.error("Excel'de soru bulunamadı."); process.exit(1); }
for (const k of sorular) if (k.gruplar && k.gruplar.length < 2) uyarilar.push(`No ${k.id}: yalnızca "${k.gruplar[0].ad}" için cevap var; diğer gruplar için de satır ekleyin.`);

const sozluk = oku("Sözlük", ["Kavram", "Kelimeler"])
  .map((r) => ({ kavram: yazi(r.Kavram), kelimeler: yazi(r.Kelimeler).split(",").map((s) => s.trim()).filter(Boolean) }))
  .filter((s) => s.kavram && s.kelimeler.length);

const sohbet = oku("Sohbet", ["Tür", "İfadeler", "Cevap"])
  .map((r) => ({ tur: yazi(r["Tür"]), ifadeler: satirlar(yazi(r["İfadeler"])), cevap: yazi(r.Cevap) }))
  .filter((s) => s.tur && s.cevap);

fs.writeFileSync(HEDEF, JSON.stringify({ sorular, sozluk, sohbet, gruplar }, null, 2) + "\n", "utf8");

const eksik = sorular.filter((k) => (k.gruplar ? k.gruplar.some((g) => !g.cevap) : !k.cevap)).map((k) => k.id);
const altsiz = sorular.filter((k) => !k.alternatifler.length).map((k) => k.id);
const grupluSayi = sorular.filter((k) => k.gruplar).length;
console.log(`${sorular.length} soru (${grupluSayi} tanesi personel grubuna göre), ${sozluk.length} sözlük kavramı, ${sohbet.length} sohbet satırı, ${gruplar.length} personel grubu → public/sss.json`);
if (eksik.length) console.log(`Cevabı eksik: ${eksik.join(", ")}`);
if (altsiz.length) console.log(`Alternatif ifadesi olmayan: ${altsiz.join(", ")}`);
uyarilar.forEach((u) => console.log("Uyarı: " + u));
console.log("Değişiklikten sonra npm test ile kontrol edin.");
