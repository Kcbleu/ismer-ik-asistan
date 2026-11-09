/*
 * Pusula eşleştiricisi: yapay zekâ ya da dış servis kullanmadan, yazım hatalarına toleranslı SSS araması.
 * Sohbet ekranı (chat.html) ve testler (scripts/test.mjs) aynı dosyayı kullanır.
 *
 *   const motor = Eslestirici.kur(bilgi);           // bilgi = sss.json içeriği
 *   const sonuc = motor.cevapla("bordorma nasl ulasirim", { onceki: 20 });
 *   // sonuc.tur: "cevap" | "oneri" | "bulunamadi" | "konu_disi" | "sohbet" | "bos"
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
    uzun: 4,        // bu kadar ya da daha çok anlamlı kelimeli mesaj "uzun" sayılır
    uzunEslesme: 2, // uzun mesajda doğrudan cevap için en az bu kadar kelime güçlü eşleşmeli
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
    "peki tamam evet hayir simdi ayni diger baska her hic"
  ).split(" "));
  // Sık yanlış yazılan durak kelimeler: "zman", "nerde", "olcak" bunlardan birine bir harf yakınsa durak sayılır.
  // Liste kısa tutulur; tüm duraklarla karşılaştırmak isimleri yutar ("araba" ≈ "acaba", "hava" ≈ "hala").
  const DURAK_HATALI = ("zaman nasil hangi hangisi neden nerede nereden nereye kiminle kadar olacak olabilir olarak " +
    "gerekiyor gerekli istiyorum istiyoruz lutfen hakkinda yapabilirim edebilirim").split(" ");
  // Fiil ekiyle biten kelimeler: eskidi, hatırlamıyorum, görevlisiyim, olacak, güzelsin.
  // SSS'de karşılığı yoksa dolgu sayılır: kapsama oranını düşürmez, konu dışı işareti de sayılmaz.
  // Karşılığı olmayan isimler (eczane, hava, araba) ise sorunun başka bir konuda olabileceğini gösterir.
  const FIIL_EKI = /([iu]yo[rm][a-z]*|[ae]?c[ae](k|g[a-z]*|m|z)|m[ae]k|m[iu]s[a-z]*|m[ae]z|[ae]bil[a-z]*|m[ae]l[iu][a-z]*|yim|yiz|s[iu]n|s[iu]n[iu]z)$/;
  // Geçmiş zaman eki (eskidi, bozuldu) isim hâlleriyle karışır (aidatı, kredi): yalnızca uzun mesajlarda dolgu sayılır
  const GECMIS_EKI = /[dt][iu](m|n|k|niz|nuz|lar)?$/;
  // Ses benzerliği: kaybet/kaybed, kitap/kitab gibi yumuşamalar yarım hata sayılır
  const SES = new Set(["dt", "td", "bp", "pb", "gk", "kg", "cs", "sc"]);

  // ---------- Metin işleme ----------
  function sade(s) {
    let t = String(s || "").toLocaleLowerCase("tr")
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
  const kokle = (w) => (w.length > KOK_UZUNLUK ? w.slice(0, KOK_UZUNLUK) : w);
  const tolerans = (n) => (n <= 3 ? 0 : n <= 5 ? 1 : 2);

  // Damerau-Levenshtein: iki kelime arasındaki harf farkı (eksik, fazla, yanlış, yer değiştirmiş harf)
  function mesafe(a, b) {
    const m = a.length, n = b.length;
    let iki = null, bir = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const su = [i];
      for (let j = 1; j <= n; j++) {
        const c = a[i - 1] === b[j - 1] ? 0 : SES.has(a[i - 1] + b[j - 1]) ? 0.5 : 1;
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
    if (w.length >= 4 && t.startsWith(w)) return 0.85;  // sigor ~ sigort
    const tol = tolerans(Math.min(t.length, w.length)); // kısa kelimeye geniş hata payı tanınmaz ("araba" ≠ "arayar")
    if (!tol || w[0] !== t[0] || w.length < t.length - 1) return 0; // ilk harf hatası nadirdir, aramayı daraltır
    let en = 99;
    for (let j = t.length - 1; j <= Math.min(w.length, t.length + 1); j++) en = Math.min(en, mesafe(t, w.slice(0, j)));
    if (en > tol) return 0;
    return en <= 0.5 ? 0.85 : en <= 1 ? 0.75 : 0.6;
  }

  // ---------- Kurulum ----------
  function kur(bilgi) {
    const sorular = (bilgi && bilgi.sorular) || [];
    const mesaj = Object.assign({}, MESAJ);
    const sohbet = [];
    for (const s of (bilgi && bilgi.sohbet) || []) {
      if (s.ifadeler && s.ifadeler.length) sohbet.push({ tur: s.tur, cevap: s.cevap, ifadeler: s.ifadeler.map(tumKelimeler).filter((x) => x.length) });
      else if (s.cevap) mesaj[s.tur] = s.cevap; // ifadesiz satırlar sistem mesajlarıdır (bulunamadi, oneri…)
    }

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
    const kavramOnbellek = new Map();
    function kavramlar(w, gevsek = false) {
      const anahtar = w + (gevsek ? "~" : "");
      if (kavramOnbellek.has(anahtar)) return kavramOnbellek.get(anahtar);
      // Kelimenin yarım yazılmış hâli kavram sayılmaz ("yeni" ≠ "yenidoğan"): eşik 0.9
      let out = new Set(kavramTek.filter(([t]) => benzerlik(w, t) >= 0.9).map(([, id]) => id));
      if (gevsek && !out.size && w.length >= 5) out = new Set(kavramTek.filter(([t]) => t.length >= 5 && benzerlik(w, t) >= 0.6).map(([, id]) => id));
      kavramOnbellek.set(anahtar, out);
      return out;
    }
    // Çok kelimeli ifadeler ("fazla mesai") ardışık kelimelerde, ekli hâlleriyle de aranır ("fazla mesaiyi")
    function ifadeKavramlari(kelimeler) {
      const out = new Set();
      for (const [parca, id] of kavramIfade) {
        for (let i = 0; i + parca.length <= kelimeler.length && !out.has(id); i++) {
          if (parca.every((p, j) => benzerlik(kelimeler[i + j], p) >= 0.85)) out.add(id);
        }
      }
      return out;
    }

    // Her SSS maddesi için terim → ağırlık tablosu
    const belgeler = sorular.map((k) => {
      const terimler = new Map();
      const ekle = (t, a) => terimler.set(t, Math.max(terimler.get(t) || 0, a));
      const alanlar = [[[k.soru, ...(k.alternatifler || [])], ALAN.soru], [[k.kategori], ALAN.kategori], [[k.cevap], ALAN.cevap]];
      for (const [metinler, a] of alanlar) for (const metin of metinler) {
        const kel = tumKelimeler(metin);
        for (const w of kel.filter(anlamli)) { ekle(kokle(w), a); kavramlar(w).forEach((id) => ekle(id, a)); }
        ifadeKavramlari(kel).forEach((id) => ekle(id, a));
      }
      // Soru ve alternatif ifadelerde yan yana geçen kelime çiftleri ("bordrom gelmedi" → "bordro gelmed")
      const ikililer = new Set();
      for (const metin of [k.soru, ...(k.alternatifler || [])]) {
        const kok = tumKelimeler(metin).filter(anlamli).map(kokle);
        for (let i = 0; i + 1 < kok.length; i++) ikililer.add(kok[i] + " " + kok[i + 1]);
      }
      return { k, terimler, ikililer, sadeSorular: [k.soru, ...(k.alternatifler || [])].map(sade) };
    });
    const df = new Map();
    belgeler.forEach((b) => b.terimler.forEach((_, t) => df.set(t, (df.get(t) || 0) + 1)));
    const N = Math.max(belgeler.length, 1);
    const idf = (t) => Math.log(1 + N / (df.get(t) || N)); // nadir kelime daha çok puan getirir
    const sozluk = [...df.keys()].filter((t) => t[0] !== "#");
    const sozlukSet = new Set(sozluk);
    // Soru, alternatif ifade ya da kategoride geçen terimler. Yalnızca cevap metninde geçen kelimeler ("yeni kart
    // siparişi", "arkadaşlarımıza") zayıf kanıttır: güçlü eşleşme ve tanınan kelime sayılmaz.
    const soruTerimleri = new Set();
    belgeler.forEach((b) => b.terimler.forEach((a, t) => { if (a >= ALAN.kategori) soruTerimleri.add(t); }));

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
      const uzunMesaj = icerik.length >= ESIK.uzun;
      const parca = (liste, bagla) => liste.map((w) => {
        const kv = kavramlar(w, !netVar(w));
        // Sözlükte birebir yazılmış kelimenin bulanık adayları atılır ("oglum" çocuk kavramıdır, "olum" değil)
        const ad = kavramTek.some(([t]) => benzerlik(w, t) === 1) ? adaylar(w).filter((a) => a.s >= 0.85) : adaylar(w);
        const bilinmez = !ad.length && !kv.size;
        const fiil = FIIL_EKI.test(w) || (uzunMesaj && GECMIS_EKI.test(w));
        // Tanınan kelime: soru düzeyinde net karşılığı ya da sözlük kavramı olan
        const taninir = kv.size > 0 || ad.some((a) => a.s >= 0.85 && soruTerimleri.has(a.t));
        return { w, adaylar: ad, kv, bagla, taninir, dolgu: bilinmez && fiil, yabanci: bilinmez && !fiil && w.length >= 4 };
      });
      const asil = parca(icerik, false);
      const sorgu = [...asil, ...parca(ek.filter(anlamliMi), true)];
      const payda = asil.filter((x) => !x.dolgu).length; // kapsama oranının paydası
      const ifadeler = ifadeKavramlari(kelimeler);
      const puanlar = belgeler.map(({ k, terimler, ikililer }) => {
        let p = 0, taninan = 0;
        const sayilan = new Set();
        const kavramPuani = (id, bagla) => {
          if (!terimler.has(id) || sayilan.has(id)) return 0;
          sayilan.add(id);
          return terimler.get(id) * idf(id) * (bagla ? 0.5 : 1);
        };
        for (const { adaylar: ad, kv, bagla } of sorgu) {
          let en = 0, guclu = false;
          for (const { t, s } of ad) if (terimler.has(t)) {
            const a = terimler.get(t), v = s * a * idf(t);
            en = Math.max(en, v);
            // Güçlü eşleşme: soru, alternatif ifade ya da kategoride geçen kelime (cevap metni sayılmaz)
            if (v >= ESIK.guclu && a >= ALAN.kategori) guclu = true;
          }
          kv.forEach((id) => {
            const v = kavramPuani(id, bagla);
            en += v;
            if (v >= ESIK.guclu && terimler.get(id) >= ALAN.kategori) guclu = true;
          });
          if (bagla) en *= 0.5;
          else if (guclu) taninan++;
          p += en;
        }
        // Kullanıcının yan yana yazdığı iki kelime soruda da yan yana geçiyorsa ek puan
        for (let i = 0; i + 1 < asil.length; i++) {
          let ek = 0;
          for (const x of asil[i].adaylar) for (const y of asil[i + 1].adaylar) {
            if (ikililer.has(x.t + " " + y.t)) ek = Math.max(ek, Math.min(x.s, y.s) * ALAN.soru * Math.min(idf(x.t), idf(y.t)));
          }
          p += ek;
        }
        ifadeler.forEach((id) => { p += kavramPuani(id, false); });
        return { k, p, taninan, kapsama: payda ? taninan / payda : 0 };
      }).sort((a, b) => b.p - a.p);
      // Hiçbir kelime SSS sözlüğünde yoksa soru büyük ihtimalle konu dışıdır
      const bilinen = asil.some((x) => x.adaylar.length || x.kv.size) || ifadeler.size > 0;
      // SSS'de hiç karşılığı olmayan isimler ("en yakın eczane" → eczane): soru başka bir konuda olabilir
      const yabanci = asil.filter((x) => x.yabanci).length;
      // SSS'de karşılığı olan kelimeler: uzun mesajda maddenin bunların en az yarısını açıklaması beklenir
      const taninabilir = asil.filter((x) => x.taninir).length;
      return { puanlar, sayilan: payda, taninabilir, bilinen, yabanci };
    }

    function karar(kelimeler, ek) {
      const { puanlar, sayilan, taninabilir, bilinen, yabanci } = ara(kelimeler, ek);
      const [b1, b2] = puanlar;
      const bulunamadi = { tur: bilinen ? "bulunamadi" : "konu_disi", sayilan };
      if (!b1 || b1.p < ESIK.oneri || !b1.taninan) return bulunamadi;
      const uzun = sayilan >= ESIK.uzun;
      const onde = !b2 || b1.p / Math.max(b2.p, 0.01) >= ESIK.fark;
      // Kısa soruda yabancı kelime varsa ("en yakın eczane", ya da "nwail" gibi okunamayan bir yazım)
      // kelimelerin yarısından fazlası tanınmadıkça doğrudan cevap verilmez; tek belirgin aday varsa öneri olarak sunulur
      const supheli = !uzun && yabanci && b1.kapsama <= ESIK.kapsama;
      if (supheli && !onde) return bulunamadi;
      // Uzun mesajlarda isim, hitap gibi tanınmayan kelimeler çoktur; bunlar sayılmaz. Ama SSS'de geçen kelimelerin
      // en az yarısını madde açıklamalı: "yeni başladım, yemek kartı ne zaman verilir" kayıp kart maddesine gitmesin.
      const kapsamaYeter = supheli ? false : uzun
        ? b1.taninan >= ESIK.uzunEslesme && b1.taninan / Math.max(taninabilir, 1) > ESIK.kapsama
        : b1.kapsama >= ESIK.kapsama;
      if (b1.p >= ESIK.kesin && kapsamaYeter && onde) return { tur: "cevap", k: b1.k, puan: b1.p, sayilan };
      const oneriler = puanlar.filter((x) => x.p >= ESIK.oneri && x.p >= b1.p * ESIK.oneriOran).slice(0, ESIK.oneriSayi).map((x) => x.k);
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
            // Durak kelime, sohbet ifadesinin başı sayılmaz ("nasıl" ≠ "nasılsın")
            return p.length >= 4 && !DURAK.has(w) && (w.startsWith(p) || (w.length >= 4 && p.startsWith(w)) || benzerlik(w, p) >= 0.75);
          });
          if (uyar) { kalan.splice(i, ifade.length); if (!ilk) ilk = s; i--; }
        }
      }
      return { ilk, kalan };
    }

    function sonucCevap(k) {
      if (!k.cevap) return { tur: "bos", metin: mesaj.bos_cevap, kaynaklar: [], oneriler: [] };
      return { tur: "cevap", metin: (k.giris ? k.giris + " " : "") + k.cevap, kaynaklar: [k.id], oneriler: [] };
    }

    function cevapla(metin, baglam = {}) {
      const s = sade(metin);
      // Listeden seçilen soru ya da birebir aynı yazılmış soru: doğrudan cevap
      const birebir = s && belgeler.find((b) => b.sadeSorular.includes(s));
      if (birebir) return sonucCevap(birebir.k);

      const { ilk, kalan } = sohbetAyikla(tumKelimeler(metin));
      if (ilk && !kalan.some(anlamliMi)) return { tur: "sohbet", metin: ilk.cevap, kaynaklar: [], oneriler: [] };

      let r = karar(kalan);
      // Kısa takip sorusu ("peki eşim?"): önceki cevabın kategorisiyle birlikte tekrar dene
      const onceki = baglam.onceki != null && sorular.find((k) => k.id === baglam.onceki);
      if (r.tur !== "cevap" && onceki && r.sayilan > 0 && r.sayilan <= 3) {
        const r2 = karar(kalan, tumKelimeler(onceki.kategori));
        if (r2.tur === "cevap") r = r2;
      }
      if (r.tur === "cevap") return sonucCevap(r.k);
      if (r.tur === "oneri") {
        return { tur: "oneri", metin: r.oneriler.length > 1 ? mesaj.oneri : mesaj.oneri_tek, kaynaklar: [], oneriler: r.oneriler.map((k) => k.id) };
      }
      return { tur: r.tur, metin: mesaj[r.tur], kaynaklar: [], oneriler: [] };
    }

    // Hata ayıklama için: her kelimenin neye eşlendiği ve en yüksek puanlı 5 madde
    function incele(metin) {
      const kel = tumKelimeler(metin);
      return {
        kelimeler: kel.filter(anlamliMi).flatMap(bol).map((w) => {
          const ad = adaylar(w), kv = kavramlar(w, !netVar(w));
          const etiket = !ad.length && !kv.size ? (FIIL_EKI.test(w) || GECMIS_EKI.test(w) ? " (dolgu?)" : " (yabancı)") : "";
          return w + " → " + (ad.map((a) => a.t + ":" + a.s).join(" ") || "?") + (kv.size ? " " + [...kv].join("") : "") + etiket;
        }),
        maddeler: ara(kel).puanlar.slice(0, 5).map((x) => ({ id: x.k.id, puan: +x.p.toFixed(1), guclu: x.taninan, kapsama: +x.kapsama.toFixed(2) })),
      };
    }

    return { cevapla, incele, sorular };
  }

  kok.Eslestirici = { kur, sade, mesafe, benzerlik };
})(typeof window !== "undefined" ? window : globalThis);
