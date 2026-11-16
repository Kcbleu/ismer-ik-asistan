// Tek dosyalık önizleme üretir: dist/onizleme.html
// Sunucu gerektirmez; telefonda veya bilgisayarda çift tıklayınca açılır. Bot, yayındaki sürümle aynı şekilde çalışır.
// Kullanım: npm run onizleme
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = (...p) => path.join(KOK, "public", ...p);
const oku = (f) => fs.readFileSync(f, "utf8");
const betikIcin = (s) => s.replace(/<\/script/gi, "<\\/script"); // gömülen kod etiketi erken kapatmasın

const sss = JSON.parse(oku(P("sss.json")));
// Görseller (assets/ismer-*.png) dosyaya data: adresi olarak gömülür
const gorselGom = (s) => s.replace(/assets\/(ismer-[\w-]+\.png)/g, (_, ad) => "data:image/png;base64," + fs.readFileSync(P("assets", ad)).toString("base64"));

let chat = gorselGom(oku(P("chat.html")));
chat = chat.replace('<script src="eslestirici.js"></script>', () => "<script>" + betikIcin(oku(P("eslestirici.js"))) + "</script>");
chat = chat.replace("</head>", () => "<script>window.__SSS__=" + betikIcin(JSON.stringify(sss)) + ";</script>\n</head>");

let index = gorselGom(oku(P("index.html")));
const srcdoc = "window.IKA_SRCDOC=" + JSON.stringify(chat).replace(/<\//g, "<\\/") + ";";
index = index.replace(/<script src="embed\.js"[^>]*><\/script>/, () => "<script>" + srcdoc + "</script>\n<script>" + betikIcin(gorselGom(oku(P("embed.js")))) + "</script>");
index = index.replace("<title>İşmer Portal – İK Asistanı prototipi</title>", "<title>İşmer Portal – İK Asistanı (önizleme)</title>");

fs.mkdirSync(path.join(KOK, "dist"), { recursive: true });
fs.writeFileSync(path.join(KOK, "dist", "onizleme.html"), index, "utf8");
console.log("dist/onizleme.html yazıldı");
