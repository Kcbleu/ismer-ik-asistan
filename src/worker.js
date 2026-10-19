// İşmer İK Asistanı – sunucu tarafı (Cloudflare Worker).
// Görevleri: soruyu kontrol etmek, limit uygulamak, SSS ile birlikte Gemini'ye göndermek,
// cevabı sohbet ekranına döndürmek. API anahtarı yalnızca burada (env.GEMINI_API_KEY) kullanılır.

import SSS from "./sss.js";
import { buildSystemPrompt } from "./prompt.js";

// Ayarlar (gerekirse wrangler.jsonc > vars ile değiştirilebilir)
const VARSAYILAN = {
  model: "gemini-3.5-flash-lite",
  maxSoruKarakter: 300,   // kullanıcının tek mesajı en fazla
  gecmisMesaj: 6,          // modele gönderilen son mesaj sayısı (3 soru + 3 cevap)
  maxCevapToken: 600,      // cevabın üst sınırı
  zamanAsimiMs: 15000,
};

const SYSTEM_PROMPT = buildSystemPrompt(SSS);
const SSS_IDLER = new Set(SSS.map((k) => k.id));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/chat") return sohbet(request, env);
    if (url.pathname === "/api/saglik") {
      return json({ durum: "ok", model: env.GEMINI_MODEL || VARSAYILAN.model, anahtar: Boolean(env.GEMINI_API_KEY) });
    }
    // Diğer her şey: public/ klasöründeki dosyalar
    return env.ASSETS.fetch(request);
  },
};

async function sohbet(request, env) {
  const cors = corsBasliklari(request, env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ hata: "yontem" }, 405, cors);
  if (cors === null) return json({ hata: "izinsiz_kaynak" }, 403);

  const ayar = ayarlar(env);

  // 1) Kullanıcı başına dakika limiti
  if (env.SOHBET_LIMIT) {
    const anahtar = request.headers.get("cf-connecting-ip") || "bilinmiyor";
    const { success } = await env.SOHBET_LIMIT.limit({ key: anahtar });
    if (!success) return json({ hata: "limit" }, 429, cors);
  }

  // 2) İstek gövdesini kontrol et
  const ham = await request.text();
  if (ham.length > 12000) return json({ hata: "gecersiz" }, 413, cors);
  let govde;
  try { govde = JSON.parse(ham); } catch { return json({ hata: "gecersiz" }, 400, cors); }

  const mesajlar = Array.isArray(govde?.mesajlar) ? govde.mesajlar : [];
  const temiz = mesajlar
    .filter((m) => m && (m.rol === "kullanici" || m.rol === "asistan") && typeof m.metin === "string")
    .slice(-ayar.gecmisMesaj)
    .map((m) => ({ rol: m.rol, metin: m.metin.trim().slice(0, m.rol === "kullanici" ? ayar.maxSoruKarakter : 1500) }))
    .filter((m) => m.metin);

  const son = temiz[temiz.length - 1];
  if (!son || son.rol !== "kullanici") return json({ hata: "gecersiz" }, 400, cors);
  if (mesajlar[mesajlar.length - 1]?.metin?.trim().length > ayar.maxSoruKarakter) {
    return json({ hata: "uzun" }, 400, cors);
  }
  // Gemini sohbeti kullanıcı mesajıyla başlamalı
  while (temiz.length && temiz[0].rol !== "kullanici") temiz.shift();

  if (!env.GEMINI_API_KEY) return json({ hata: "ayar" }, 500, cors);

  // 3) Gemini'ye gönder
  const govdeGemini = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: temiz.map((m) => ({ role: m.rol === "kullanici" ? "user" : "model", parts: [{ text: m.metin }] })),
    generationConfig: { temperature: 0.2, maxOutputTokens: ayar.maxCevapToken },
  };

  let yanit;
  try {
    yanit = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ayar.model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify(govdeGemini),
        signal: AbortSignal.timeout(ayar.zamanAsimiMs),
      }
    );
  } catch (e) {
    console.error("gemini_baglanti", String(e));
    return json({ hata: "servis" }, 502, cors);
  }

  if (yanit.status === 429) return json({ hata: "kota" }, 503, cors);
  if (!yanit.ok) {
    console.error("gemini_hata", yanit.status, (await yanit.text()).slice(0, 500));
    return json({ hata: "servis" }, 502, cors);
  }

  const veri = await yanit.json();
  const metin = (veri?.candidates?.[0]?.content?.parts || [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim();

  if (!metin) {
    console.error("gemini_bos", veri?.candidates?.[0]?.finishReason);
    return json({ hata: "servis" }, 502, cors);
  }

  const { cevap, kaynaklar } = kaynakAyikla(metin);
  // Kullanımı loglarda görmek için (Cloudflare > Workers > Logs)
  console.log("kullanim", JSON.stringify(veri?.usageMetadata || {}), "kaynak", kaynaklar.join(",") || "yok");

  return json({ cevap, kaynaklar }, 200, cors);
}

// Cevabın sonundaki [SSS:1,7] etiketini ayıklar
export function kaynakAyikla(metin) {
  const desen = /\[SSS:\s*([^\]]*)\]\s*$/i;
  const eslesme = metin.match(desen);
  let kaynaklar = [];
  if (eslesme) {
    kaynaklar = eslesme[1]
      .split(/[,\s]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => SSS_IDLER.has(n));
  }
  const cevap = metin.replace(/\[SSS:[^\]]*\]/gi, "").trim();
  return { cevap, kaynaklar: [...new Set(kaynaklar)] };
}

function ayarlar(env) {
  const sayi = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    model: env.GEMINI_MODEL || VARSAYILAN.model,
    maxSoruKarakter: sayi(env.MAX_SORU_KARAKTER, VARSAYILAN.maxSoruKarakter),
    gecmisMesaj: sayi(env.GECMIS_MESAJ, VARSAYILAN.gecmisMesaj),
    maxCevapToken: sayi(env.MAX_CEVAP_TOKEN, VARSAYILAN.maxCevapToken),
    zamanAsimiMs: VARSAYILAN.zamanAsimiMs,
  };
}

// Aynı adresten açılan sayfa her zaman izinli. Portal gibi başka adreslerden çağrı için
// IZINLI_KAYNAKLAR değişkenine virgülle adres eklenir (örn. https://portal.ornek.com).
function corsBasliklari(request, env) {
  const origin = request.headers.get("origin");
  const kendi = new URL(request.url).origin;
  const izinli = (env.IZINLI_KAYNAKLAR || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!origin || origin === kendi) return {};
  if (izinli.includes(origin)) {
    return {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      vary: "origin",
    };
  }
  return null;
}

function json(veri, durum = 200, ekBaslik = {}) {
  return new Response(JSON.stringify(veri), {
    status: durum,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...ekBaslik },
  });
}
