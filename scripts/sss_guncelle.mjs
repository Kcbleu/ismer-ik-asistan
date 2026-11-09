// SSS Excel dosyasını (data/sss.xlsx) sohbet ekranının okuyacağı public/sss.json dosyasına çevirir.
// Kullanım: npm run sss
//
// Sayfalar (sütunlar başlık adına göre okunur, sıraları önemli değil):
//   SSS    : No, Kategori, Soru, Cevap, Alternatif İfadeler, Giriş
//   Sözlük : Kavram, Kelimeler (virgülle)
//   Sohbet : Tür, İfadeler (her biri ayrı satırda), Cevap
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

const sorular = [];
const gorulen = new Set();
for (const r of oku("SSS", ["No", "Kategori", "Soru", "Cevap"])) {
  const soru = yazi(r.Soru);
  const no = Number(r.No.result ?? r.No.value);
  if (!soru || !Number.isInteger(no) || no <= 0) continue; // boş satırlar, alttaki özet tablosu ve notlar
  if (gorulen.has(no)) { uyarilar.push(`SSS ${r._satir}. satır: No ${no} birden fazla kez kullanılmış, atlandı.`); continue; }
  gorulen.add(no);
  sorular.push({
    id: no,
    kategori: yazi(r.Kategori),
    soru,
    cevap: yazi(r.Cevap),
    alternatifler: r["Alternatif İfadeler"] ? satirlar(yazi(r["Alternatif İfadeler"])) : [],
    giris: r["Giriş"] ? yazi(r["Giriş"]) : "",
  });
}
if (!sorular.length) { console.error("Excel'de soru bulunamadı."); process.exit(1); }

const sozluk = oku("Sözlük", ["Kavram", "Kelimeler"])
  .map((r) => ({ kavram: yazi(r.Kavram), kelimeler: yazi(r.Kelimeler).split(",").map((s) => s.trim()).filter(Boolean) }))
  .filter((s) => s.kavram && s.kelimeler.length);

const sohbet = oku("Sohbet", ["Tür", "İfadeler", "Cevap"])
  .map((r) => ({ tur: yazi(r["Tür"]), ifadeler: satirlar(yazi(r["İfadeler"])), cevap: yazi(r.Cevap) }))
  .filter((s) => s.tur && s.cevap);

fs.writeFileSync(HEDEF, JSON.stringify({ sorular, sozluk, sohbet }, null, 2) + "\n", "utf8");

const eksik = sorular.filter((k) => !k.cevap).map((k) => k.id);
const altsiz = sorular.filter((k) => !k.alternatifler.length).map((k) => k.id);
console.log(`${sorular.length} soru, ${sozluk.length} sözlük kavramı, ${sohbet.length} sohbet satırı → public/sss.json`);
if (eksik.length) console.log(`Cevabı eksik: ${eksik.join(", ")}`);
if (altsiz.length) console.log(`Alternatif ifadesi olmayan: ${altsiz.join(", ")}`);
uyarilar.forEach((u) => console.log("Uyarı: " + u));
console.log("Değişiklikten sonra npm test ile kontrol edin.");
