"""SSS Excel dosyasını (data/sss.xlsx) botun okuyacağı dosyalara çevirir.

Kullanım:  python scripts/sss_guncelle.py
Excel'de A:No, B:Kategori, C:Soru, D:Cevap sütunları beklenir (ilk satır başlık).
Çıktılar: public/sss.json (sohbet ekranı için) ve src/sss.js (sunucu için).
"""
import json, pathlib, sys
from openpyxl import load_workbook

KOK = pathlib.Path(__file__).resolve().parent.parent
wb = load_workbook(KOK / "data" / "sss.xlsx", data_only=True)
ws = wb["SSS"] if "SSS" in wb.sheetnames else wb.active

kayitlar = []
for satir in ws.iter_rows(min_row=2, values_only=True):
    no, kategori, soru, cevap = (list(satir) + [None] * 4)[:4]
    if not soru or not str(soru).strip():
        continue  # boş satırları ve alttaki özet tablosunu atla
    if not isinstance(no, (int, float)):
        continue
    kayitlar.append({
        "id": int(no),
        "kategori": str(kategori or "").strip(),
        "soru": str(soru).strip(),
        "cevap": str(cevap).strip() if cevap else "",
    })

if not kayitlar:
    sys.exit("Excel'de soru bulunamadı.")

(KOK / "public" / "sss.json").write_text(json.dumps(kayitlar, ensure_ascii=False, indent=2), encoding="utf-8")
(KOK / "src" / "sss.js").write_text(
    "// Bu dosya scripts/sss_guncelle.py ile üretilir. Elle düzenlemeyin; data/sss.xlsx'i güncelleyin.\n"
    "export default " + json.dumps(kayitlar, ensure_ascii=False, indent=2) + ";\n",
    encoding="utf-8",
)
eksik = [k["id"] for k in kayitlar if not k["cevap"]]
print(f"{len(kayitlar)} soru yazıldı.", f"Cevabı eksik: {eksik}" if eksik else "")
