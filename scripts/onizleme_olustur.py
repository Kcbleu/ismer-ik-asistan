"""Tek dosyalık önizleme üretir: dist/onizleme.html

Sunucu ve API gerektirmez; telefonda veya bilgisayarda çift tıklayınca açılır.
Asistan "Demo" modunda çalışır (Gemini yerine SSS'den basit eşleştirme).
Kullanım: python scripts/onizleme_olustur.py
"""
import base64, json, pathlib, re

KOK = pathlib.Path(__file__).resolve().parent.parent
P = KOK / "public"

logo = "data:image/png;base64," + base64.b64encode((P / "assets/ismer-logo.png").read_bytes()).decode()
sss = json.loads((P / "sss.json").read_text(encoding="utf-8"))

chat = (P / "chat.html").read_text(encoding="utf-8")
enjekte = "<script>window.__DEMO__=true;window.__SSS__=" + json.dumps(sss, ensure_ascii=False) + ";</script>"
chat = chat.replace("</head>", enjekte + "\n</head>", 1)

index = (P / "index.html").read_text(encoding="utf-8")
index = index.replace("assets/ismer-logo.png", logo)
embed = (P / "embed.js").read_text(encoding="utf-8").replace("</script", "<\\/script")
srcdoc_js = "window.IKA_SRCDOC=" + json.dumps(chat, ensure_ascii=False).replace("</", "<\\/") + ";"
index = re.sub(
    r'<script src="embed\.js"[^>]*></script>',
    lambda _: "<script>" + srcdoc_js + "</script>\n<script>" + embed + "</script>",
    index,
)
index = index.replace("<title>İşmer Portal – İK Asistanı prototipi</title>", "<title>İşmer Portal – İK Asistanı (önizleme)</title>")

(KOK / "dist").mkdir(exist_ok=True)
(KOK / "dist" / "onizleme.html").write_text(index, encoding="utf-8")
print("dist/onizleme.html yazıldı")
