/*
 * İşmer Asistan – portala ekleme betiği.
 * Portal sayfasına tek satır eklenir (README'deki "Portala ekleme" bölümüne bakın):
 *   script etiketi, src="https://ASISTAN-ADRESI/embed.js", defer
 * Sağ alta "İşmer Asistan" butonu koyar; tıklanınca sohbet penceresini (chat.html) açar.
 * İlk ziyarette butonun üstünde örnek sorulu kısa bir tanıtım kartı gösterir (data-tanitim="kapali" ile kapatılır).
 * Portalın kendi stillerine dokunmaz: tüm sınıflar "ika-" önekli, sohbet iframe içinde.
 *
 * Portaldaki herhangi bir bağlantı ya da kutucuk da asistanı açabilir:
 *   data-ismer-asistan                         → asistanı açar
 *   data-ismer-asistan="Kaç gün iznim kaldı?"  → asistanı açar ve bu soruyu sorar
 * ya da betikten: IsmerAsistan.ac(), IsmerAsistan.kapat(), IsmerAsistan.sor("...")
 */
(function () {
  if (window.__ikaYuklendi) return;
  window.__ikaYuklendi = true;

  var betik = document.currentScript;
  var taban = betik && betik.src ? new URL(".", betik.src).href : "";
  var sohbetAdresi = (betik && betik.dataset.chatUrl) || taban + "chat.html";
  var tanitimKapali = betik && betik.dataset.tanitim === "kapali";
  // Önizleme dosyasında görseller sayfaya gömülüdür (data: adresi); normalde betiğin yanındaki assets klasöründen gelir
  function varlik(yol) { return /^data:/.test(yol) ? yol : taban + yol; }
  var AMBLEM = varlik("assets/ismer-amblem.png");
  var KULE = varlik("assets/ismer-kule.png");
  var ORNEK_SORULAR = ["Kaç gün iznim kaldı?", "Bordroma nasıl ulaşabilirim?", "Yemek kartımı kaybettim"];
  var TANITIM_ARALIK = 30 * 24 * 60 * 60 * 1000; // kapatılan ya da asistan açılan tarayıcıda 30 gün tekrar gösterilmez

  var yazi = "Ubuntu,system-ui,-apple-system,'Segoe UI',sans-serif";
  var css =
    // Buton: lacivert hap, solda beyaz daire içinde İşmer logosu, yanında iki satır metin
    ".ika-btn{position:fixed;right:24px;bottom:24px;z-index:2147483000;display:flex;align-items:center;gap:12px;" +
    "height:60px;padding:0 22px 0 6px;border:0;border-radius:999px;background:#0033A1;color:#fff;cursor:pointer;text-align:left;" +
    "font-family:" + yazi + ";box-shadow:0 8px 24px rgba(0,51,161,.32)}" +
    ".ika-btn:hover{background:#002A85}" +
    ".ika-btn:focus-visible{outline:2px solid #2563EB;outline-offset:3px}" +
    ".ika-btn::after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none}" +
    ".ika-dikkat .ika-btn::after{animation:ika-nabiz 1.8s ease-out 3}" +
    "@keyframes ika-nabiz{0%{box-shadow:0 0 0 0 rgba(37,99,235,.5)}100%{box-shadow:0 0 0 16px rgba(37,99,235,0)}}" +
    ".ika-logo{flex:none;width:48px;height:48px;border-radius:50%;background:#fff;display:grid;place-items:center;color:#0033A1}" +
    ".ika-logo img{width:38px;height:auto;display:block}" +
    ".ika-logo .ika-x{display:none}" +
    ".ika-acik .ika-logo img{display:none}.ika-acik .ika-logo .ika-x{display:block}" +
    ".ika-yazi{display:flex;flex-direction:column;gap:3px}" +
    ".ika-ad{font-size:15.5px;font-weight:700;line-height:1.15;letter-spacing:.01em}" +
    ".ika-alt{font-size:12.5px;line-height:1.2;opacity:.85}" +
    // Sohbet paneli
    ".ika-panel{position:fixed;right:24px;bottom:96px;z-index:2147483000;width:410px;height:min(660px,calc(100vh - 120px));" +
    "background:#fff;border:1px solid #E5E7EB;border-radius:16px;overflow:hidden;box-shadow:0 16px 40px rgba(15,23,42,.18);" +
    "opacity:0;transform:translateY(8px);visibility:hidden;transition:opacity .16s ease,transform .16s ease,visibility 0s linear .16s}" +
    ".ika-acik .ika-panel{opacity:1;transform:none;visibility:visible;transition:opacity .16s ease,transform .16s ease}" +
    ".ika-panel iframe{display:block;width:100%;height:100%;border:0}" +
    // Tanıtım kartı: butonun üstünde, örnek sorularla
    ".ika-tanitim{position:fixed;right:24px;bottom:98px;z-index:2147483000;box-sizing:border-box;width:330px;padding:16px;" +
    "background:#fff;border:1px solid #E5E7EB;border-radius:16px;box-shadow:0 16px 40px rgba(15,23,42,.16);" +
    "font-family:" + yazi + ";color:#1E293B;text-align:left;" +
    "opacity:0;transform:translateY(8px);visibility:hidden;transition:opacity .2s ease,transform .2s ease,visibility 0s linear .2s}" +
    ".ika-tanitim.ika-gorunur{opacity:1;transform:none;visibility:visible;transition:opacity .2s ease,transform .2s ease}" +
    ".ika-acik .ika-tanitim{display:none}" +
    ".ika-tanitim::after{content:'';position:absolute;right:46px;bottom:-7px;width:12px;height:12px;background:#fff;" +
    "border-right:1px solid #E5E7EB;border-bottom:1px solid #E5E7EB;transform:rotate(45deg)}" +
    ".ika-t-ust{display:flex;align-items:center;gap:10px;margin:0 32px 10px 0}" +
    ".ika-t-av{flex:none;width:34px;height:34px;border-radius:50%;background:#0033A1;display:grid;place-items:center}" +
    ".ika-t-av img{width:22px;height:auto;display:block;filter:brightness(0) invert(1)}" +
    ".ika-t-ad{display:block;font-size:15px;font-weight:700;line-height:1.2}" +
    ".ika-t-alt{display:block;font-size:12px;color:#64748B;line-height:1.3}" +
    ".ika-t-metin{margin:0 0 12px;font-size:14px;line-height:1.45;color:#334155}" +
    ".ika-t-sorular{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}" +
    ".ika-t-soru{display:flex;align-items:center;gap:8px;width:100%;min-height:40px;padding:8px 12px;box-sizing:border-box;" +
    "border:1px solid #E5E7EB;border-radius:10px;background:#F8FAFC;color:#1E293B;font:500 13.5px/1.3 " + yazi + ";text-align:left;cursor:pointer}" +
    ".ika-t-soru:hover{border-color:#C7D6FA;background:#F5F8FF}" +
    ".ika-t-soru:focus-visible,.ika-t-kapat:focus-visible{outline:2px solid #2563EB;outline-offset:2px}" +
    ".ika-t-soru span{flex:1}.ika-t-soru svg{flex:none;color:#2563EB}" +
    ".ika-t-kapat{position:absolute;top:8px;right:8px;width:36px;height:36px;border:0;border-radius:8px;background:transparent;" +
    "color:#64748B;cursor:pointer;display:grid;place-items:center}" +
    ".ika-t-kapat:hover{background:#F1F5F9;color:#1E293B}" +
    // Telefon: yuvarlak buton, panel tam ekran
    "@media (max-width:640px){.ika-btn{right:16px;bottom:16px;width:60px;height:60px;padding:0;justify-content:center}" +
    ".ika-yazi{display:none}" +
    ".ika-panel{inset:0;width:auto;height:100%;border:0;border-radius:0;transform:none}" +
    ".ika-acik .ika-btn{display:none}" +
    ".ika-tanitim{right:16px;bottom:88px;width:calc(100vw - 32px);max-width:340px;padding:14px}" +
    ".ika-tanitim::after{right:24px}" +
    ".ika-t-metin{font-size:13.5px;margin-bottom:10px}" +
    ".ika-t-sorular li:nth-child(n+2){display:none}}" + // telefonda kart sayfayı kapatmasın: tek örnek soru

    "@media (prefers-reduced-motion:reduce){.ika-panel,.ika-acik .ika-panel,.ika-tanitim,.ika-tanitim.ika-gorunur{transition:none;transform:none}" +
    ".ika-dikkat .ika-btn::after{animation:none}}";

  var stil = document.createElement("style");
  stil.textContent = css;
  document.head.appendChild(stil);

  var kok = document.createElement("div");
  kok.className = "ika-kok";

  var ICON_X = '<svg class="ika-x" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var ICON_CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

  var buton = document.createElement("button");
  buton.type = "button";
  buton.className = "ika-btn";
  buton.setAttribute("aria-expanded", "false");
  buton.setAttribute("aria-controls", "ika-panel");
  buton.setAttribute("aria-label", "İşmer Asistan'ı aç");
  buton.title = "İşmer Asistan · İK sorularınız için";
  buton.innerHTML =
    '<span class="ika-logo"><img src="' + AMBLEM + '" alt="">' + ICON_X + "</span>" +
    '<span class="ika-yazi"><span class="ika-ad">İşmer Asistan</span><span class="ika-alt">İK sorularınızı yanıtlar</span></span>';

  var panel = document.createElement("div");
  panel.className = "ika-panel";
  panel.id = "ika-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "İşmer Asistan");

  var iframe = null;
  var iframeHazir = false;
  var bekleyenSoru = null;
  var acik = false;

  function ac() {
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.title = "İşmer Asistan";
      if (typeof window.IKA_SRCDOC === "string") iframe.srcdoc = window.IKA_SRCDOC; // önizleme dosyası için
      else iframe.src = sohbetAdresi;
      iframe.addEventListener("load", function () {
        iframeHazir = true;
        if (acik) bildir();
        if (bekleyenSoru) { soruGonder(bekleyenSoru); bekleyenSoru = null; }
      });
      panel.appendChild(iframe);
    }
    acik = true;
    kok.classList.add("ika-acik");
    buton.setAttribute("aria-expanded", "true");
    buton.setAttribute("aria-label", "İşmer Asistan'ı kapat");
    tanitimiKapat(true);
    bildir();
  }
  function kapat() {
    acik = false;
    kok.classList.remove("ika-acik");
    buton.setAttribute("aria-expanded", "false");
    buton.setAttribute("aria-label", "İşmer Asistan'ı aç");
    buton.focus();
  }
  function bildir() {
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: "ika:acildi" }, "*");
      try { iframe.focus(); } catch (e) {}
    }
  }
  function soruGonder(metin) {
    iframe.contentWindow.postMessage({ type: "ika:sor", metin: metin }, "*");
  }
  // Asistanı açar ve soruyu sorar (sohbet penceresi henüz yüklenmediyse yüklenince)
  function sor(metin) {
    ac();
    if (iframeHazir) soruGonder(metin); else bekleyenSoru = metin;
  }

  // ---------- Tanıtım kartı ----------
  var tanitim = null;
  function sakla(tur, anahtar, deger) {
    try { (tur === "kalici" ? localStorage : sessionStorage).setItem(anahtar, deger); } catch (e) {}
  }
  function oku(tur, anahtar) {
    try { return (tur === "kalici" ? localStorage : sessionStorage).getItem(anahtar); } catch (e) { return null; }
  }
  function tanitimGosterilsinMi() {
    if (tanitimKapali) return false;
    if (/[?&]ika-tanitim\b/.test(location.search)) return true; // denemek için: adresin sonuna ?ika-tanitim
    if (oku("oturum", "ika:tanitim-goruldu")) return false;     // aynı oturumda portal sayfaları arasında tekrar çıkmaz
    var kapanis = Number(oku("kalici", "ika:tanitim-kapatildi")) || 0;
    return Date.now() - kapanis > TANITIM_ARALIK;
  }
  function tanitimiKur() {
    tanitim = document.createElement("aside");
    tanitim.className = "ika-tanitim";
    tanitim.setAttribute("aria-label", "İşmer Asistan tanıtımı");
    tanitim.innerHTML =
      '<button type="button" class="ika-t-kapat" aria-label="Tanıtımı kapat" title="Kapat">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>' +
      '<div class="ika-t-ust"><span class="ika-t-av"><img src="' + KULE + '" alt=""></span>' +
      '<span><span class="ika-t-ad">İşmer Asistan</span><span class="ika-t-alt">İnsan Kaynakları asistanı</span></span></div>' +
      '<p class="ika-t-metin">Merhaba! İzin, bordro, sağlık sigortası gibi İK sorularınızı buradan sorabilirsiniz.</p>' +
      '<ul class="ika-t-sorular"></ul>';
    var liste = tanitim.querySelector(".ika-t-sorular");
    ORNEK_SORULAR.forEach(function (metin) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ika-t-soru";
      b.innerHTML = "<span></span>" + ICON_CHEV;
      b.firstChild.textContent = metin;
      b.addEventListener("click", function () { sor(metin); });
      li.appendChild(b);
      liste.appendChild(li);
    });
    tanitim.querySelector(".ika-t-kapat").addEventListener("click", function () { tanitimiKapat(true); buton.focus(); });
    kok.insertBefore(tanitim, buton);
  }
  // kalici: kullanıcı kartı kapattı ya da asistanı açtı; 30 gün gösterilmez
  function tanitimiKapat(kalici) {
    if (kalici) sakla("kalici", "ika:tanitim-kapatildi", String(Date.now()));
    if (!tanitim) return;
    tanitim.classList.remove("ika-gorunur");
    kok.classList.remove("ika-dikkat");
  }

  buton.addEventListener("click", function () { acik ? kapat() : ac(); });
  window.addEventListener("message", function (e) {
    if (iframe && e.source === iframe.contentWindow && e.data && e.data.type === "ika:kapat") kapat();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && acik) kapat(); });
  // Portaldaki data-ismer-asistan işaretli bağlantılar ve kutucuklar
  document.addEventListener("click", function (e) {
    var hedef = e.target && e.target.closest ? e.target.closest("[data-ismer-asistan]") : null;
    if (!hedef) return;
    e.preventDefault();
    var soru = hedef.getAttribute("data-ismer-asistan");
    if (soru) sor(soru); else ac();
  });
  window.IsmerAsistan = { ac: ac, kapat: kapat, sor: sor };

  kok.appendChild(panel);
  kok.appendChild(buton);
  (document.body || document.documentElement).appendChild(kok);

  if (tanitimGosterilsinMi()) {
    tanitimiKur();
    setTimeout(function () {
      if (acik) return;
      sakla("oturum", "ika:tanitim-goruldu", "1");
      tanitim.classList.add("ika-gorunur");
      kok.classList.add("ika-dikkat");
    }, 1500);
  }
})();
