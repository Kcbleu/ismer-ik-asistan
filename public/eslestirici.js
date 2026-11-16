/*
 * İşmer Asistan eşleştiricisi: yapay zekâ ya da dış servis kullanmadan, yazım hatalarına toleranslı SSS araması.
 * Sohbet ekranı (chat.html) ve testler (scripts/test.mjs) aynı dosyayı kullanır.
 *
 *   const motor = Eslestirici.kur(bilgi);           // bilgi = sss.json içeriği
 *   const sonuc = motor.cevapla("bordorma nasl ulasirim", { onceki: 20, grup: "Ofis personeli" });
 *   // sonuc.tur: "cevap" | "grup_sor" | "oneri" | "bulunamadi" | "konu_disi" | "sohbet" | "bos"
 *   // grup_sor: madde bulundu ama cevabı personel grubuna göre değişiyor; sonuc.secenekler arasından seçilir
 *
 * Adımlar: metni sadeleştir → sohbet ifadesi mi? → kelimeleri SSS sözlüğüne bulanık eşle
 * → kavramları (eş anlamlar) ekle → her SSS maddesini puanla → cevap / öneri / bulunamadı kararı.
 */
(function (kok) {
  // ---------- Ayarlar ----------
  const ESIK = {
    kesin: 9,       // bu puanın üstü doğrudan cevaplanabilir
    oneri: 4,       // bu puanın altı "bulunamadı"
    fark: 1.25,     // doğrudan cevap için birinci aday ikinciden en az bu kat önde olmalı
    kapsama: 0.5,   // kısa soruda (en fazla 3 anlamlı kelime) kelimelerin en az yarısı tanınmalı
    guclu: 1,       // kapsamaya sayılan eşleşmenin en düşük puanı (cevap metninde geçen sıradan kelime sayılmaz)
    gucluBenzerlik: 0.75, // güçlü eşleşme ve ifade benzerliği için en düşük kelime benzerliği
    uzun: 4,        // bu kadar ya da daha çok anlamlı kelimeli mesaj "uzun" sayılır
    uzunEslesme: 2, // uzun mesajda doğrudan cevap için en az bu kadar kelime güçlü eşleşmeli
    benzerlik: 0.35,    // doğrudan cevap için soru, maddenin en az bir ifadesine bu kadar benzemeli (0-1)…
    benzerlikEksik: 0.6, // …sorudaki anlamlı bir kelime maddede karşılık bulmuyorsa ("hangi telefonu alayım") bu kadar
    benzerlikEtki: 0.5, // ifade benzerliğinin sıralamaya etkisi: puan × (1 ± bu değer)
    nadirCevap: 1,      // yalnızca bir maddenin cevabında geçen kelimenin ağırlığı (sıradan cevap kelimesi 0.5)
    celiskiOran: 0.5,   // çelişki için diğer maddenin puanı birincinin en az bu oranı olmalı
    gucluTipler: ["hangi", "kisi", "yer", "zaman"], // bu tiplerde soru, maddede yoksa çekirdek tam karşılanmalı
    soruTipi: 2,        // soru tipi (ne zaman, kaç, nereden, kime…) eşleşmesinin ağırlığı
    oneriOran: 0.6, // öneri listesine birincinin puanının en az %60'ını alanlar girer
    oneriSayi: 3,
  };
  // Soru ve alternatif ifadeler en değerli alan. Kategori düşük tutulur: aynı kategorideki maddeleri ayırt etmez.
  const ALAN = { soru: 3, kategori: 1, cevap: 0.5 };
  const KOK_UZUNLUK = 6; // Türkçe ekler için kaba kök: kelimenin ilk 6 harfi

  const MESAJ = {
    bulunamadi: "Bu soruyu sık sorulan sorular arasında bulamadım. Sorunuzu farklı kelimelerle yazabilir ya da İnsan Kaynakları ile iletişime geçebilirsiniz (insan.kaynaklari@ismer.com.tr).",
    konu_disi: "Bu konuda yardımcı olamıyorum. İzin, bordro, sağlık sigortası, yemek kartı gibi İşmer'deki çalışma hayatınızla ilgili sorularınızı yanıtlayabilirim.",
    bos_cevap: "Bu konuda elimde net bir bilgi yok. Lütfen İnsan Kaynakları ile iletişime geçin (insan.kaynaklari@ismer.com.tr).",
    oneri: "Sorunuzu tam anlayamadım. Aşağıdakilerden birini mi soruyorsunuz?",
    oneri_tek: "Sorunuzu tam anlayamadım. Bunu mu soruyorsunuz?",
    grup_sor: "Bu konuda izlenecek yol personel grubunuza göre değişiyor. Hangi gruptasınız?",
    grup_tamam: "Teşekkürler, bundan sonra “{grup}” için geçerli bilgileri göstereceğim. Sorunuzu yazabilirsiniz.",
  };

  // Sahada sık görülen kısaltmalar ve yazımlar (sadeleştirilmiş hâlleriyle)
  const KISALTMA = {
    slm: "selam", slmlar: "selamlar", sa: "selamunaleykum", mrb: "merhaba", mrhb: "merhaba", mrbler: "merhaba",
    tsk: "tesekkur", tskler: "tesekkurler", tskr: "tesekkur", tsklr: "tesekkurler", eyv: "eyvallah", eyw: "eyvallah", sgl: "sagol", sgol: "sagol",
    nsl: "nasil", nasl: "nasil", nasi: "nasil", nbr: "nasilsin", bi: "bir", nerden: "nereden", nrdn: "nereden", nrde: "nerede",
    zmn: "zaman", nzmn: "ne zaman", ik: "insan kaynaklari", ikya: "insan kaynaklarina", ikye: "insan kaynaklarina",
    tc: "kimlik", tckn: "kimlik",
  };
  // Kelime başı değişimleri: "mailime", "emailler" → "eposta…" (ekler korunur)
  const ON_EK = [["email", "eposta"], ["mail", "eposta"]];
  // Birlikte ya da ayrı yazılabilen ifadeler
  const BIRLESTIR = [
    [/\be ?(posta|mail)/g, "eposta"],
    [/\bweb ?mail/g, "webmail"],
    [/\bsag ?ol/g, "sagol"],
  ];
  // Anlam taşımayan kelimeler (sadeleştirilmiş)
  const DURAK = new Set((
    "ve ile veya ya yada mi mu ne bir bu su o da de ki icin gibi kadar daha en cok az acaba lutfen rica " +
    "nasil hangi hangisi neden niye nerede nereden nereye kime kimle kiminle kac zaman ne zaman " +
    "ben benim bana beni biz bizim bize siz sizin size sen senin bunu bunun sunu onu " +
    "var varmi yok olur olabilir olarak olan oldu olsun olacak ama fakat ise yani sey bisey " +
    "durum durumu durumunda durumda sekilde yol yolu yollari konu konusunda hakkinda bilgi lazim gerek gerekir gerekiyor gerekli " +
    "istiyorum isterim istedim yapmak etmek yapabilirim yapilir yapmaliyim yapacagim yapcam edebilirim edilir yapayim edeyim etmeliyim " +
    "alirim alabilirim alinir ulasabilirim ulasirim ulasamiyorum ulasamadim ulasilir ulasmak gorebilirim gorurum goruntuleyebilirim ogrenebilirim ogrenirim " +
    "bulabilirim bakabilirim izleyebilirim " +
    "misin musun miyim misiniz musunuz miyiz midir mudur mumkun " +
    "abi abla hocam efendim bey hanimefendi acil yardim yardimci edin eder ederim " +
    "dun bugun yarin gecen istiyor istiyoruz istiyorlar istiyordum yapabilir yapabiliriz yapmamiz yapmam yapalim yoksa sadece ayrica hala zaten " +
    "nedir neler nelerdir demek sorun sorunu sorunum problem problemi problemim " +
    "peki tamam evet hayir simdi ayni diger baska her hic"
  ).split(" "));
  // Sık yanlış yazılan durak kelimeler: "zman", "nerde", "olcak" bunlardan birine bir harf yakınsa durak sayılır.
  // Liste kısa tutulur; tüm duraklarla karşılaştırmak isimleri yutar ("araba" ≈ "acaba", "hava" ≈ "hala").
  const DURAK_HATALI = ("zaman nasil hangi hangisi neden nerede nereden nereye kiminle kadar olacak olabilir olarak " +
    "gerekiyor gerekli istiyorum istiyoruz lutfen hakkinda yapabilirim edebilirim").split(" ");
  // Fiil ekiyle biten kelimeler: eskidi, hatırlamıyorum, görevlisiyim, olacak, güzelsin.
  // SSS'de karşılığı yoksa dolgu sayılır: kapsama oranını düşürmez, konu dışı işareti de sayılmaz.
  // Karşılığı olmayan isimler (eczane, hava, araba) ise sorunun başka bir konuda olabileceğini gösterir.
  const FIIL_EKI = /([iu]yo[rm][a-z]*|[ae]?c[ae](k|g[a-z]*|m|z)|m[ae]k|m[iu]s[a-z]*|m[ae]z|[ae]bil[a-z]*|m[ae]l[iu][a-z]*|yim|yiz|s[iu]n|s[iu]n[iu]z|[aeiu]r([iu]m|s[iu]n|[iu]z))$/; // …, alırım, görürüm
  // Geçmiş zaman eki (eskidi, bozuldu) isim hâlleriyle karışır (aidatı, kredi): yalnızca uzun mesajlarda dolgu sayılır
  const GECMIS_EKI = /[dt][iu](m|n|k|niz|nuz|lar)?$/;
  // Ses benzerliği: kaybet/kaybed, kitap/kitab gibi yumuşamalar yarım hata sayılır
  const SES = new Set(["dt", "td", "bp", "pb", "gk", "kg", "cs", "sc"]);
  // Türkçe Q klavye (sadeleştirilmiş harflerle). Yan yana tuşların karışması sık görülen bir yazım hatasıdır
  // ve ucuzdur; uzak harflerin yer değiştirmesi ise çoğu zaman başka bir kelimedir ("babalık" ≠ "babamı", "doldu" ≠ "doğdu").
  const KLAVYE = ["qwertyuiopgu", "asdfghjklsi", "zxcvbnmoc"];
  const TUS = {};
  KLAVYE.forEach((sira, y) => [...sira].forEach((h, x) => (TUS[h] = TUS[h] || []).push([y, x])));
  const yanYana = (a, b) => (TUS[a] || []).some(([y1, x1]) => (TUS[b] || []).some(([y2, x2]) => Math.abs(y1 - y2) <= 1 && Math.abs(x1 - x2) <= 1));
  const DEGISIM = new Map();
  function degisim(a, b) {
    const k = a + b;
    if (!DEGISIM.has(k)) DEGISIM.set(k, SES.has(k) ? 0.5 : yanYana(a, b) ? 0.75 : 1.25);
    return DEGISIM.get(k);
  }

  // ---------- Metin işleme ----------
  // Kategori "Konu / Alt başlık" biçimindedir: konu "/" öncesidir
  const konuAdi = (k) => (k || "").split("/")[0].trim() || "Diğer";

  function sade(s) {
    let t = String(s || "").toLocaleLowerCase("tr")
      // "öldü/ölüm/ölen" sadeleşince "oldu"ya (çocuğum oldu) karışır: ö ile yazıldıysa anlamı korunur
      .replace(/(^|[^a-zçğıöşü])öl(dü|üm|en|mü|dük|düğ)[a-zçğıöşü]*/g, "$1vefat")
      .replace(/ı/g, "i").replace(/̇/g, "").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
      .replace(/[âà]/g, "a").replace(/[îì]/g, "i").replace(/[ûù]/g, "u")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/([a-z])\1{2,}/g, "$1$1"); // izinnnn → izinn
    for (const [d, y] of BIRLESTIR) t = t.replace(d, y);
    return t.trim();
  }
  // Tüm kelimeler (durak kelimeler dahil), kısaltmalar açılmış
  function tumKelimeler(s) {
    const out = [];
    for (let w of sade(s).split(" ")) {
      if (!w) continue;
      for (const [d, y] of ON_EK) if (w.startsWith(d)) { w = y + w.slice(d.length); break; }
      const k = KISALTMA[w];
      if (k) out.push(...k.split(" ")); else out.push(w);
    }
    return out;
  }
  const anlamli = (w) => w.length >= 2 && !DURAK.has(w);

  // Soru tipi: "ne zaman", "kaç gün", "nereden", "kime" gibi kelimeler konu taşımaz ama sorunun ne istediğini söyler.
  // Durak kelime olarak elenmeden önce okunur ve aynı tipte soran maddelere küçük bir ek puan verir.
  const SORU_TIPI = [
    ["zaman", /\b(ne zaman|nezaman|kacta|ne vakit)\b/],
    ["miktar", /\b(kac|ne kadar|nekadar)\b/],
    ["yer", /\b(nereden|nerden|nerede|nerde|nereye|nereden)\b/],
    ["kisi", /\b(kime|kiminle|kimle|kimden|kim)\b/],
    ["nasil", /\bnasil\b/],
    ["hangi", /\b(hangi|hangisi|hangileri)\b/],
    ["tanim", /\b(nedir|ne demek|neler|nelerdir)\b/],
    ["evet_hayir", /\b(mi|mu|miyim|misin|musun|miyiz|misiniz|musunuz|midir|mudur)\b|(mi|mu|miyim|miyiz)$/],
  ];
  function soruTipleri(kelimeler) {
    const metin = kelimeler.join(" ");
    return new Set(SORU_TIPI.filter(([, d]) => d.test(metin)).map(([ad]) => ad));
  }
  const kokle = (w) => (w.length > KOK_UZUNLUK ? w.slice(0, KOK_UZUNLUK) : w);
  const tolerans = (n) => (n <= 3 ? 0 : n <= 5 ? 1 : 2);

  // Damerau-Levenshtein: iki kelime arasındaki harf farkı (eksik, fazla, yanlış, yer değiştirmiş harf).
  // Yanlış harfin maliyeti klavyedeki uzaklığa göre değişir (yan tuş 0.75, ses yumuşaması 0.5, uzak harf 1.25).
  function mesafe(a, b) {
    const m = a.length, n = b.length;
    let iki = null, bir = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const su = [i];
      for (let j = 1; j <= n; j++) {
        const c = a[i - 1] === b[j - 1] ? 0 : degisim(a[i - 1], b[j - 1]);
        let v = Math.min(bir[j] + 1, su[j - 1] + 1, bir[j - 1] + c);
        if (iki && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, iki[j - 2] + 1);
        su.push(v);
      }
      iki = bir; bir = su;
    }
    return bir[n];
  }

  // Kullanıcının kelimesi w, sözlükteki terim t ile ne kadar benzeşiyor? (0 = hiç, 1 = aynı)
  // Türkçe ekler yüzünden w'nin baş kısmı t ile karşılaştırılır: "sigortaya" ~ "sigort".
  function benzerlik(w, t) {
    if (w === t || kokle(w) === t) return 1;
    if (t.length >= 3 && w.startsWith(t)) return 0.95;  // izinlerim ~ izin
    if (w.length >= 4 && t.startsWith(w)) return 0.85;  // kart ~ kartı, sigor ~ sigort
    const tol = tolerans(Math.min(t.length, w.length)); // kısa kelimeye geniş hata payı tanınmaz ("araba" ≠ "arayar")
    if (!tol || w[0] !== t[0] || w.length < t.length - 1) return 0; // ilk harf hatası nadirdir, aramayı daraltır
    let en = 99;
    for (let j = t.length - 1; j <= Math.min(w.length, t.length + 1); j++) en = Math.min(en, mesafe(t, w.slice(0, j)));
    if (en > tol) return 0;
    return en <= 0.5 ? 0.85 : en <= 1 ? 0.75 : 0.6;
  }

  // ---------- Kurulum ----------
  function kur(bilgi, secenek = {}) {
    const E = Object.assign({}, ESIK, secenek.esik); // eşikler denemelerde dışarıdan değiştirilebilir
    const sorular = (bilgi && bilgi.sorular) || [];
    const mesaj = Object.assign({}, MESAJ);
    const sohbet = [];
    for (const s of (bilgi && bilgi.sohbet) || []) {
      if (s.ifadeler && s.ifadeler.length) sohbet.push({ tur: s.tur, cevap: s.cevap, ifadeler: s.ifadeler.map(tumKelimeler).filter((x) => x.length) });
      else if (s.cevap) mesaj[s.tur] = s.cevap; // ifadesiz satırlar sistem mesajlarıdır (bulunamadi, oneri…)
    }
    // Personel grupları (Excel'deki Personel Grupları sayfası): bazı maddelerin cevabı gruba göre değişir
    // (kalan izin: banka PDH personeli İzin Yönetim Sistemi'nden, ofis personeli Bilişim HR'dan bakar)
    const gruplar = ((bilgi && bilgi.gruplar) || []).map((g) => ({
      ad: g.ad, secenek: g.secenek || g.ad, kelimeler: (g.kelimeler || []).map(tumKelimeler).filter((x) => x.length),
    }));

    // Kavramlar (Excel'deki Sözlük sayfası): tek kelimeler ve çok kelimeli ifadeler ayrı tutulur
    const kavramTek = [], kavramIfade = [];
    ((bilgi && bilgi.sozluk) || []).forEach((s, i) => {
      const id = "#" + i;
      for (const k of s.kelimeler || []) {
        const parca = tumKelimeler(k);
        if (parca.length === 1) kavramTek.push([parca[0], id]);
        else if (parca.length > 1) kavramIfade.push([parca, id]);
      }
    });
    // Kelimenin kavramları. gevsek: yazım hatalı kelimeler için bulanık eşleme de yapılır.
    // Kelimenin SSS'de net bir karşılığı varsa gevsek kullanılmaz ("kartimi" → "karim" = eş olmasın).
    // enAz: kelimenin SSS'deki en yakın kelimeye benzerliği. Kavram ondan daha yakın değilse alınmaz
    // ("doldu" → "doldur"a "doğdu"dan yakın: çocuk kavramı sayılmaz).
    const kavramOnbellek = new Map();
    function kavramlar(w, gevsek = false, enAz = 0) {
      const anahtar = w + (gevsek ? "~" + enAz : "");
      if (kavramOnbellek.has(anahtar)) return kavramOnbellek.get(anahtar);
      // Ses yumuşaması sayılır ("bebeği" ~ "bebek"); kelime, sözlükteki daha uzun bir kelimenin başıysa sayılmaz:
      // "yeni" ≠ "yenidoğan", "baba" ≠ "babam" (babalık izni cenaze izni değildir)
      const kb = (t) => (t !== w && t.startsWith(w) ? 0 : benzerlik(w, t));
      let out = new Set(kavramTek.filter(([t]) => kb(t) >= 0.85).map(([, id]) => id));
      if (gevsek && !out.size && w.length >= 5) {
        // Yazım hatalı kelimede yalnızca en yakın kavram alınır ("kagidini" → kağıt, "karımı" değil)
        let en = Math.max(0.6, enAz);
        for (const [t] of kavramTek) if (t.length >= 5) en = Math.max(en, kb(t));
        out = new Set(kavramTek.filter(([t]) => t.length >= 5 && kb(t) >= en).map(([, id]) => id));
      }
      kavramOnbellek.set(anahtar, out);
      return out;
    }
    // Çok kelimeli ifadeler ("fazla mesai") ardışık kelimelerde, ekli hâlleriyle de aranır ("fazla mesaiyi")
    // kelimeKavram verilirse ifadedeki her kelimeye o kavram da bağlanır ("maaş pusulası" → "pusulası" da bordro sayılır)
    function ifadeKavramlari(kelimeler, kelimeKavram) {
      const out = new Set();
      for (const [parca, id] of kavramIfade) {
        for (let i = 0; i + parca.length <= kelimeler.length; i++) {
          if (!parca.every((p, j) => benzerlik(kelimeler[i + j], p) >= 0.85)) continue;
          out.add(id);
          if (kelimeKavram) parca.forEach((_, j) => {
            const w = kelimeler[i + j];
            if (!kelimeKavram.has(w)) kelimeKavram.set(w, new Set());
            kelimeKavram.get(w).add(id);
          });
        }
      }
      return out;
    }

    // Her SSS maddesi için terim → ağırlık tablosu
    const belgeler = sorular.map((k) => {
      const terimler = new Map();
      const ekle = (t, a) => terimler.set(t, Math.max(terimler.get(t) || 0, a));
      // E-posta adresinin alan adı (@ismer.com.tr) konu değil iletişim bilgisidir; pek çok cevapta geçer ve
      // "ismer com tr" gibi sorularda web sitesi maddesini gölgeler. Adresin baş kısmı (operasyon@) kalır.
      const cevaplar = [k.cevap, ...(k.gruplar || []).map((g) => g.cevap)].map((c) => String(c || "").replace(/@[\w-]+(\.[\w-]+)+/g, " "));
      const alanlar = [[[k.soru, ...(k.alternatifler || [])], ALAN.soru], [[k.kategori], ALAN.kategori], [cevaplar, ALAN.cevap]];
      for (const [metinler, a] of alanlar) for (const metin of metinler) {
        const kel = tumKelimeler(metin);
        for (const w of kel.filter(anlamli)) { ekle(kokle(w), a); kavramlar(w).forEach((id) => ekle(id, a)); }
        ifadeKavramlari(kel).forEach((id) => ekle(id, a));
      }
      // Soru ve alternatif ifadelerde yan yana geçen kelime çiftleri ("bordrom gelmedi" → "bordro gelmed")
      // ve her ifadenin kelime listesi (ifade benzerliği için)
      const ikililer = new Set(), ifadeler = [], tipler = new Set();
      for (const metin of [k.soru, ...(k.alternatifler || [])]) {
        const tum = tumKelimeler(metin), kel = tum.filter(anlamli);
        soruTipleri(tum).forEach((x) => tipler.add(x));
        const kok = kel.map(kokle);
        for (let i = 0; i + 1 < kok.length; i++) ikililer.add(kok[i] + " " + kok[i + 1]);
        const ifadeKv = new Map();
        ifadeKavramlari(tum, ifadeKv);
        ifadeler.push(kel.map((w) => ({
          t: kokle(w), kv: new Set([...kavramlar(w), ...(ifadeKv.get(w) || [])]), fiil: FIIL_EKI.test(w), // "kartı" isimdir
        })));
      }
      // Çekirdek: maddenin ifadelerinin en az üçte ikisinde geçen kavram ya da isim (24: yemek kartı + kayıp).
      // Sözlükte kavramı olmayan fiiller ("görüşebilirim") çekirdek sayılmaz.
      const birimler = ifadeler.map((ifade) => new Set(ifade.flatMap((s) => (s.kv.size ? [...s.kv] : s.fiil ? [] : [s.t]))));
      const sayac = new Map();
      birimler.forEach((b) => b.forEach((u) => sayac.set(u, (sayac.get(u) || 0) + 1)));
      const cekirdek = [...sayac].filter(([, n]) => n >= Math.ceil((2 / 3) * birimler.length)).map(([u]) => u);
      return { k, terimler, ikililer, ifadeler, tipler, cekirdek, sadeSorular: [k.soru, ...(k.alternatifler || [])].map(sade) };
    });
    const df = new Map();
    belgeler.forEach((b) => b.terimler.forEach((_, t) => df.set(t, (df.get(t) || 0) + 1)));
    const N = Math.max(belgeler.length, 1);
    const idf = (t) => Math.log(1 + N / (df.get(t) || N)); // nadir kelime daha çok puan getirir
    const tipDf = new Map();
    belgeler.forEach((b) => b.tipler.forEach((x) => tipDf.set(x, (tipDf.get(x) || 0) + 1)));
    const tipIdf = (x) => Math.log(1 + N / (tipDf.get(x) || N));
    // Yalnızca tek bir maddenin cevabında geçen kelime ("epikriz") o maddeye özgüdür: kategori ağırlığına yükseltilir
    belgeler.forEach((b) => b.terimler.forEach((a, t) => {
      if (t[0] !== "#" && a === ALAN.cevap && df.get(t) === 1 && t.length >= 5) b.terimler.set(t, E.nadirCevap);
    }));
    const sozluk = [...df.keys()].filter((t) => t[0] !== "#");
    const sozlukSet = new Set(sozluk);
    // Soru, alternatif ifade ya da kategoride geçen terimler. Yalnızca cevap metninde geçen kelimeler ("yeni kart
    // siparişi", "arkadaşlarımıza") zayıf kanıttır: güçlü eşleşme ve tanınan kelime sayılmaz.
    const soruTerimleri = new Set();
    belgeler.forEach((b) => b.terimler.forEach((a, t) => { if (a >= ALAN.kategori) soruTerimleri.add(t); }));

    // İfade benzerliği (0-1): kullanıcının sorusu ile maddenin bir ifadesi (soru ya da alternatif) ne kadar örtüşüyor?
    // İki yönlüdür: sorudaki fazla kelimeler de, ifadede olup soruda olmayan kelimeler de benzerliği düşürür.
    // "şirket mailine nasıl girilir" → "Şirket mailime nasıl girerim?" yüksek, "Mail şifremi unuttum" düşük.
    // Kelimeler nadirliklerine (idf) göre ağırlıklıdır.
    belgeler.forEach((b) => b.ifadeler.forEach((ifade) => {
      ifade.forEach((s) => { s.w = idf(s.t); });
      ifade.norm = ifade.reduce((a, s) => a + s.w * s.w, 0);
    }));
    function ifadeBenzerligi(sorgu, belge) {
      let en = 0;
      for (const ifade of belge.ifadeler) {
        // Tek kelimelik ifade ("Hangi evraklar gerekiyor?" → evrak) kategorisi olmadan anlamsızdır: çok kelimeli soruyla karşılaştırılmaz
        if (!ifade.length || (ifade.length < 2 && sorgu.length >= 2)) continue;
        const kullanildi = new Set();
        let ortak = 0;
        for (const q of sorgu) {
          let iyi = 0, iyiSira = -1;
          ifade.forEach((s, i) => {
            if (kullanildi.has(i)) return;
            let v = 0;
            for (const a of q.adaylar) if (a.t === s.t && a.s >= E.gucluBenzerlik) v = Math.max(v, a.s);
            for (const id of q.kv) if (s.kv.has(id)) v = Math.max(v, 1);
            if (v * s.w > iyi) { iyi = v * s.w; iyiSira = i; }
          });
          if (iyiSira >= 0) { kullanildi.add(iyiSira); ortak += iyi * q.w; } // iyi = benzerlik × ifade kelimesinin ağırlığı
        }
        const qNorm = sorgu.reduce((a, q) => a + q.w * q.w, 0);
        if (qNorm) en = Math.max(en, ortak / Math.sqrt(qNorm * ifade.norm));
      }
      return Math.min(en, 1);
    }

    // Kelimeye uyan sözlük terimleri. Birebir karşılığı varsa bulanık benzerlere bakılmaz ("kartim" → "karim" olmasın);
    // yalnızca kısa bir önek eşleşiyorsa ("kartti" ~ "kart") bulanık adaylar da tutulur ("kartti" ~ "karti").
    const onbellek = new Map();
    function adaylar(w) {
      if (onbellek.has(w)) return onbellek.get(w);
      const liste = [];
      for (const t of sozluk) { const s = benzerlik(w, t); if (s) liste.push({ t, s }); }
      const sonuc = liste.some((a) => a.s === 1) ? liste.filter((a) => a.s >= 0.85) : liste;
      onbellek.set(w, sonuc);
      return sonuc;
    }
    const netVar = (w) => adaylar(w).some((a) => a.s >= 0.85);
    const enYakin = (w) => Math.max(0, ...adaylar(w).map((a) => a.s)); // SSS kelimelerine en yüksek benzerlik
    // Anlamlı kelime mi? Hatalı yazılmış durak kelimeler de ("zman", "olcak", "nerde") elenir,
    // ama SSS'de net karşılığı olan kelimeye dokunulmaz ("yeni" ≠ "yani").
    const anlamliOnbellek = new Map();
    function anlamliMi(w) {
      if (!anlamli(w)) return false;
      if (!anlamliOnbellek.has(w)) {
        const durakBenzeri = w.length >= 4 && !netVar(w) && !kavramlar(w).size &&
          DURAK_HATALI.some((d) => d[0] === w[0] && Math.abs(d.length - w.length) <= 1 && mesafe(d, w) <= 1);
        anlamliOnbellek.set(w, !durakBenzeri);
      }
      return anlamliOnbellek.get(w);
    }
    // Bitişik yazılmış kelimeyi ayır: "yemekkartim" → "yemek" + "kartim"
    function bol(w) {
      if (w.length < 7 || netVar(w)) return [w];
      for (let i = 3; i <= w.length - 3; i++) {
        const a = w.slice(0, i), b = w.slice(i);
        if (sozlukSet.has(kokle(a)) && anlamliMi(b) && netVar(b)) return [a, b];
      }
      return [w];
    }

    // Puanlama. ek: kapsamaya sayılmayan bağlam kelimeleri (önceki sorunun kategorisi)
    function ara(kelimeler, ek = []) {
      const icerik = kelimeler.filter(anlamliMi).flatMap(bol);
      const uzunMesaj = icerik.length >= E.uzun;
      const ifadeKv = new Map(); // çok kelimeli sözlük ifadelerinden kelimelere geçen kavramlar
      const ifadeler = ifadeKavramlari(kelimeler, ifadeKv);
      const parca = (liste, bagla) => liste.map((w) => {
        const kv = new Set([...kavramlar(w, !netVar(w), enYakin(w)), ...(bagla ? [] : ifadeKv.get(w) || [])]);
        // Sözlükte birebir yazılmış kelimenin bulanık adayları atılır ("oglum" çocuk kavramıdır, "olum" değil)
        const ad = kavramTek.some(([t]) => benzerlik(w, t) === 1) ? adaylar(w).filter((a) => a.s >= 0.85) : adaylar(w);
        const fiil = FIIL_EKI.test(w) || (uzunMesaj && GECMIS_EKI.test(w));
        // SSS'de yalnızca zayıf (bulanık) benzeri olan fiil de dolgu sayılır ("alınamadı diyorlar", "değiştiriyorum");
        // en fazla iki kelimelik sorularda her kelime önemlidir, orada sayılmaz ("hangi telefonu alayım")
        const zayif = !kv.size && !ad.some((a) => a.s >= 0.85) && fiil && icerik.length >= 3;
        const bilinmez = (!ad.length && !kv.size) || zayif;
        // Tanınan kelime: soru düzeyinde net karşılığı ya da sözlük kavramı olan
        const taninir = kv.size > 0 || ad.some((a) => a.s >= 0.85 && soruTerimleri.has(a.t));
        return { w, adaylar: ad, kv, bagla, taninir, dolgu: bilinmez && fiil, yabanci: bilinmez && !fiil && w.length >= 4 };
      });
      const asil = parca(icerik, false);
      const sorgu = [...asil, ...parca(ek.filter(anlamliMi), true)];
      const payda = asil.filter((x) => !x.dolgu).length; // kapsama oranının paydası
      const tipler = soruTipleri(kelimeler);
      // İfade benzerliği için kullanıcının kelimeleri ve ağırlıkları (tanınmayan kelime orta ağırlıkta sayılır)
      const benzerSorgu = asil.filter((x) => !x.dolgu).map((x) => {
        const net = x.adaylar.filter((a) => a.s >= 0.85);
        const w = Math.max(0, ...(net.length ? net : x.adaylar).map((a) => idf(a.t) * a.s), ...[...x.kv].map(idf));
        return { adaylar: x.adaylar, kv: x.kv, w: w || 2.5 };
      });
      const puanlar = belgeler.map((belge) => {
        const { k, terimler, ikililer } = belge;
        let p = 0, taninan = 0, eksik = 0;
        const sayilan = new Set(), gucluler = new Set(), eksikler = [];
        const kavramPuani = (id, bagla) => {
          if (!terimler.has(id) || sayilan.has(id)) return 0;
          sayilan.add(id);
          return terimler.get(id) * idf(id) * (bagla ? 0.5 : 1);
        };
        sorgu.forEach(({ adaylar: ad, kv, bagla, dolgu, taninir }, i) => {
          let en = 0, guclu = false;
          for (const { t, s } of ad) if (terimler.has(t)) {
            const a = terimler.get(t), v = s * a * idf(t);
            en = Math.max(en, v);
            // Güçlü eşleşme: soru, alternatif ifade ya da kategoride geçen kelime (cevap metni sayılmaz),
            // çok zayıf bulanık benzerlik sayılmaz ("gidebilirim" ~ "giderken")
            if (v >= E.guclu && a >= ALAN.kategori && s >= E.gucluBenzerlik) guclu = true;
          }
          kv.forEach((id) => {
            const v = kavramPuani(id, bagla);
            en += v;
            if (v >= E.guclu && terimler.get(id) >= ALAN.kategori) guclu = true;
          });
          if (bagla) en *= 0.5;
          else if (guclu) { taninan++; gucluler.add(i); }
          // Maddede güçlü karşılığı olmayan kelime. Uzun mesajlarda SSS'de hiç geçmeyen kelimeler (isim, hitap) sayılmaz.
          if (!bagla && !dolgu && !guclu && (taninir || !uzunMesaj)) { eksik++; eksikler.push(i); }
          p += en;
        });
        // Kullanıcının yan yana yazdığı iki kelime soruda da yan yana geçiyorsa ek puan
        for (let i = 0; i + 1 < asil.length; i++) {
          let ek = 0;
          for (const x of asil[i].adaylar) for (const y of asil[i + 1].adaylar) {
            if (ikililer.has(x.t + " " + y.t)) ek = Math.max(ek, Math.min(x.s, y.s) * ALAN.soru * Math.min(idf(x.t), idf(y.t)));
          }
          p += ek;
        }
        ifadeler.forEach((id) => { p += kavramPuani(id, false); });
        // Aynı tipte soru ("ne zaman", "kaç gün", "kime") küçük ek puan; yalnızca konu eşleşmesi varsa
        if (p > 0) tipler.forEach((x) => { if (belge.tipler.has(x)) p += E.soruTipi * tipIdf(x); });
        const benzer = ifadeBenzerligi(benzerSorgu, belge);
        return { k, p: p * (1 + E.benzerlikEtki * Math.max(0, 2 * benzer - 1)), benzer, eksik, eksikler, gucluler, taninan, kapsama: payda ? taninan / payda : 0 };
      }).sort((a, b) => b.p - a.p);
      // Çelişki: birinci adayın açıklayamadığı bir isim ("şirket sitesine nasıl girerim" → site, "yemek kartı limiti" → limit)
      // başka bir maddede güçlü geçiyorsa soru o maddenin değil, başka bir konunun sorusu olabilir
      const celiski = (aday) => aday.eksikler.some((i) => {
        const w = asil[i].w;
        // "limiti" isimdir, -ti eki sayılmaz. Diğer madde de ciddi bir aday olmalı ("kardeşim işe girmek istiyor":
        // kardeş cenaze maddesinde geçer ama o madde zayıf bir aday, çelişki sayılmaz)
        return !FIIL_EKI.test(w) && puanlar.some((d) => d !== aday && d.gucluler.has(i) && d.p >= aday.p * E.celiskiOran);
      });
      // Hiçbir kelime SSS sözlüğünde yoksa soru büyük ihtimalle konu dışıdır
      const bilinen = asil.some((x) => x.adaylar.length || x.kv.size) || ifadeler.size > 0;
      // SSS'de hiç karşılığı olmayan isimler ("en yakın eczane" → eczane): soru başka bir konuda olabilir
      const yabanci = asil.filter((x) => x.yabanci).length;
      // SSS'de karşılığı olan kelimeler: uzun mesajda maddenin bunların en az yarısını açıklaması beklenir
      const taninabilir = asil.filter((x) => x.taninir).length;
      return { puanlar, sayilan: payda, taninabilir, bilinen, yabanci, celiski, asil, tipler };
    }

    // Soru, maddenin çekirdeğindeki her kavramı/kelimeyi karşılıyor mu?
    function cekirdekTam(k, sorgu) {
      const belge = belgeler.find((b) => b.k === k);
      return belge.cekirdek.length > 0 && belge.cekirdek.every((u) => sorgu.some((q) =>
        u[0] === "#" ? q.kv.has(u) : q.adaylar.some((a) => a.t === u && a.s >= E.gucluBenzerlik)));
    }

    function karar(kelimeler, ek) {
      const { puanlar, sayilan, taninabilir, bilinen, yabanci, celiski, asil: asilSorgu, tipler } = ara(kelimeler, ek);
      const [b1, b2] = puanlar;
      const bulunamadi = { tur: bilinen ? "bulunamadi" : "konu_disi", sayilan };
      if (!b1 || b1.p < E.oneri || !b1.taninan) return bulunamadi;
      const uzun = sayilan >= E.uzun;
      const onde = !b2 || b1.p / Math.max(b2.p, 0.01) >= E.fark;
      const yakinlar = puanlar.filter((x) => x.p >= E.oneri && x.p >= b1.p * E.oneriOran);
      // Kısa soruda yabancı kelime varsa ("en yakın eczane", ya da "nwail" gibi okunamayan bir yazım)
      // kelimelerin yarısından fazlası tanınmadıkça doğrudan cevap verilmez. Az sayıda aday varsa öneri sunulur
      // ("ikame konusunda sorum var" → 35, 36); konu çok genişse ("araba sigortası" → 12 madde) bulunamadı denir.
      const supheli = !uzun && yabanci && b1.kapsama <= E.kapsama;
      if (supheli && !onde && yakinlar.length > E.oneriSayi) {
        // Adayların hepsi aynı konudaysa o konu gösterilir ("sigortam ne zaman devreye giriyor" → Sağlık Sigortası)
        const konular = new Set(yakinlar.map((x) => konuAdi(x.k.kategori)));
        return konular.size === 1 ? { ...bulunamadi, konu: [...konular][0] } : bulunamadi;
      }
      // Uzun mesajlarda isim, hitap gibi tanınmayan kelimeler çoktur; bunlar sayılmaz. Ama SSS'de geçen kelimelerin
      // en az yarısını madde açıklamalı: "yeni başladım, yemek kartı ne zaman verilir" kayıp kart maddesine gitmesin.
      const kapsamaYeter = supheli ? false : uzun
        ? b1.taninan >= E.uzunEslesme && b1.taninan / Math.max(taninabilir, 1) > E.kapsama
        : b1.kapsama >= E.kapsama;
      // Soru, maddenin hiçbir ifadesine yeterince benzemiyorsa ("hangi telefonu alayım" ~ "telefondan maile bakabilir miyim")
      // doğrudan cevap verilmez, öneri sunulur
      // Sorudaki bir kelime maddede karşılık bulmuyorsa: ya soru maddenin ifadelerine çok benzemeli ya da maddenin
      // çekirdeğini tam karşılamalı ("bordromu nasıl indiririm" → 20'nin çekirdeği bordro; "hangi telefonu alayım" →
      // 33'ün çekirdeği telefon + e-posta, e-posta yok)
      // Soru tipi uyuşmazlığı da aynı şekilde ele alınır ("hangi hastanelere…" sorusu, evet-hayır sorusu olan
      // "Hastaneye giderken sigorta kartı lazım mı?" maddesine ancak çekirdeği (sigorta + kart) karşılıyorsa gider)
      const belge1 = belgeler.find((b) => b.k === b1.k);
      const tipUyumsuz = [...tipler].some((x) => E.gucluTipler.includes(x) && !belge1.tipler.has(x));
      const benzerYeter = b1.benzer >= E.benzerlik &&
        (!(b1.eksik || tipUyumsuz) || b1.benzer >= E.benzerlikEksik || cekirdekTam(b1.k, asilSorgu));
      const celiskiYok = uzun || !celiski(b1);
      if (b1.p >= E.kesin && kapsamaYeter && onde && benzerYeter && celiskiYok) return { tur: "cevap", k: b1.k, puan: b1.p, sayilan };
      const oneriler = yakinlar.slice(0, E.oneriSayi).map((x) => x.k);
      return { tur: "oneri", oneriler, puan: b1.p, sayilan };
    }

    // Selamlaşma, teşekkür gibi ifadeler mesajdan çıkarılır. Geriye anlamlı kelime kalmazsa sohbet cevabı verilir.
    function sohbetAyikla(kelimeler) {
      let kalan = kelimeler.slice(), ilk = null;
      for (const s of sohbet) for (const ifade of s.ifadeler) {
        for (let i = 0; i + ifade.length <= kalan.length; i++) {
          const uyar = ifade.every((p, j) => {
            const w = kalan[i + j];
            if (w === p) return true;
            // Durak kelime, sohbet ifadesinin başı sayılmaz ("nasıl" ≠ "nasılsın"). Bulanık eşleşme yalnızca kelimenin
            // tamamıyla yapılır ("tesekur" ~ "tesekkur"); başı kesilip karşılaştırılmaz ("sağlık" ≠ "sağol").
            return p.length >= 4 && !DURAK.has(w) && (w.startsWith(p) || (w.length >= 4 && p.startsWith(w)) ||
              (Math.abs(w.length - p.length) <= 1 && w[0] === p[0] && mesafe(w, p) <= 1));
          });
          if (uyar) { kalan.splice(i, ifade.length); if (!ilk) ilk = s; i--; }
        }
      }
      return { ilk, kalan };
    }

    // Mesajda personel grubu geçiyorsa ("ofis personeliyim", "bankada çalışıyorum") grubu okur ve bu kelimeleri
    // sorudan çıkarır; hemen ardından gelen "personeli/çalışıyorum" da çıkarılır. Bu yüzden grup kelimeleri SSS
    // sorularında geçmemelidir (npm test kontrol eder).
    function grupAyikla(kelimeler) {
      let grup = null;
      const kalan = kelimeler.slice();
      for (const g of gruplar) for (const ifade of g.kelimeler) {
        for (let i = 0; i + ifade.length <= kalan.length; i++) {
          if (!ifade.every((p, j) => benzerlik(kalan[i + j], p) >= 0.85)) continue;
          let n = ifade.length;
          while (i + n < kalan.length && /^(personel|calis)/.test(kalan[i + n])) n++;
          kalan.splice(i, n);
          grup = grup || g.ad;
          i--;
        }
      }
      return { grup, kalan };
    }

    // anlasilan: serbest yazılmış sorunun hangi maddeye eşlendiği ekranda gösterilir (listeden seçilen soruda gerekmez)
    // grup: kullanıcının personel grubu. Cevabı gruba göre değişen maddede grup bilinmiyorsa önce grup sorulur.
    function sonucCevap(k, anlasilan = false, grup = null) {
      const anlasilanSoru = anlasilan ? k.soru : null;
      const turler = k.gruplar || [];
      const secili = grup && turler.find((g) => g.ad === grup);
      if (turler.length && !secili && !(grup && k.cevap)) {
        const secenekler = turler.map((g) => {
          const tanim = gruplar.find((x) => x.ad === g.ad);
          return { ad: g.ad, secenek: tanim ? tanim.secenek : g.ad };
        });
        return { tur: "grup_sor", metin: mesaj.grup_sor, kaynaklar: [k.id], oneriler: [], secenekler, anlasilan: anlasilanSoru };
      }
      const cevap = secili ? secili.cevap : k.cevap;
      if (!cevap) return { tur: "bos", metin: mesaj.bos_cevap, kaynaklar: [], oneriler: [] };
      return {
        tur: "cevap", metin: (k.giris ? k.giris + " " : "") + cevap, kaynaklar: [k.id], oneriler: [], anlasilan: anlasilanSoru,
        grup: secili ? secili.ad : null, gruplar: turler.map((g) => g.ad),
      };
    }

    function cevapla(metin, baglam = {}) {
      const { grup: soylenen, kalan: grupsuz } = grupAyikla(tumKelimeler(metin));
      const r = bul(metin, grupsuz, soylenen, soylenen || baglam.grup || null, baglam);
      // Mesajda söylenen grup sonuçla birlikte döner: sohbet ekranı hatırlar
      if (soylenen && !r.grup) r.grup = soylenen;
      return r;
    }

    function bul(metin, grupsuz, soylenen, grup, baglam) {
      const s = sade(metin);
      // Listeden seçilen soru ya da birebir aynı yazılmış soru: doğrudan cevap
      const birebir = s && belgeler.find((b) => b.sadeSorular.includes(s));
      if (birebir) return sonucCevap(birebir.k, false, grup);

      const { ilk, kalan } = sohbetAyikla(grupsuz);
      const onceki = baglam.onceki != null && sorular.find((k) => k.id === baglam.onceki);
      // Yalnızca grup söylendi ("ofis personeliyim", "peki bankada?"): önceki madde gruba göre değişiyorsa o grubun cevabı
      if (soylenen && !kalan.some(anlamliMi)) {
        if (onceki && (onceki.gruplar || []).length) return sonucCevap(onceki, false, soylenen);
        return { tur: "sohbet", metin: mesaj.grup_tamam.replace("{grup}", soylenen), kaynaklar: [], oneriler: [] };
      }
      if (ilk && !kalan.some(anlamliMi)) return { tur: "sohbet", metin: ilk.cevap, kaynaklar: [], oneriler: [] };

      let r = karar(kalan);
      // Kısa takip sorusu ("peki eşim?"): önceki cevabın kategorisiyle birlikte tekrar dene
      if (r.tur !== "cevap" && onceki && r.sayilan > 0 && r.sayilan <= 3) {
        const r2 = karar(kalan, tumKelimeler(onceki.kategori));
        if (r2.tur === "cevap") r = r2;
      }
      if (r.tur === "cevap") return sonucCevap(r.k, true, grup);
      if (r.tur === "oneri") {
        return { tur: "oneri", metin: r.oneriler.length > 1 ? mesaj.oneri : mesaj.oneri_tek, kaynaklar: [], oneriler: r.oneriler.map((k) => k.id) };
      }
      return { tur: r.tur, metin: mesaj[r.tur], kaynaklar: [], oneriler: [], konu: r.konu || null };
    }

    // Hata ayıklama için: her kelimenin neye eşlendiği ve en yüksek puanlı 5 madde
    function incele(metin) {
      const kel = grupAyikla(tumKelimeler(metin)).kalan;
      return {
        kelimeler: kel.filter(anlamliMi).flatMap(bol).map((w) => {
          const ad = adaylar(w), kv = kavramlar(w, !netVar(w), enYakin(w));
          const etiket = !ad.length && !kv.size ? (FIIL_EKI.test(w) || GECMIS_EKI.test(w) ? " (dolgu?)" : " (yabancı)") : "";
          return w + " → " + (ad.map((a) => a.t + ":" + a.s).join(" ") || "?") + (kv.size ? " " + [...kv].join("") : "") + etiket;
        }),
        maddeler: ara(kel).puanlar.slice(0, 5).map((x) => ({ id: x.k.id, puan: +x.p.toFixed(1), benzer: +x.benzer.toFixed(2), eksik: x.eksik, guclu: x.taninan, kapsama: +x.kapsama.toFixed(2) })),
        ozet: (({ sayilan, taninabilir, yabanci }) => ({ sayilan, taninabilir, yabanci }))(ara(kel)),
      };
    }

    return { cevapla, incele, sorular, gruplar };
  }

  kok.Eslestirici = { kur, sade, mesafe, benzerlik };
})(typeof window !== "undefined" ? window : globalThis);
