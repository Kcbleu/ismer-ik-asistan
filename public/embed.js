/*
 * İşmer İK Asistanı – portala ekleme betiği.
 * Portal sayfasına tek satır eklenir (README'deki "Portala ekleme" bölümüne bakın):
 *   script etiketi, src="https://ASISTAN-ADRESI/embed.js", defer
 * Sağ alta "Pusula'ya Sor" butonu koyar; tıklanınca sohbet penceresini (chat.html) açar.
 * Portalın kendi stillerine dokunmaz: tüm sınıflar "ika-" önekli, sohbet iframe içinde.
 */
(function () {
  if (window.__ikaYuklendi) return;
  window.__ikaYuklendi = true;

  var betik = document.currentScript;
  var taban = betik && betik.src ? new URL(".", betik.src).href : "";
  var sohbetAdresi = (betik && betik.dataset.chatUrl) || taban + "chat.html";

  var css =
    ".ika-btn{position:fixed;right:24px;bottom:24px;z-index:2147483000;display:flex;align-items:center;gap:10px;" +
    "height:52px;padding:0 20px 0 16px;border:0;border-radius:999px;background:#0033A1;color:#fff;cursor:pointer;" +
    "font:500 15px/1 Ubuntu,system-ui,-apple-system,'Segoe UI',sans-serif;box-shadow:0 6px 18px rgba(0,51,161,.32)}" +
    ".ika-btn:hover{background:#002A85}" +
    ".ika-btn:focus-visible{outline:2px solid #2563EB;outline-offset:3px}" +
    ".ika-btn svg{flex:none}" +
    ".ika-btn .ika-x{display:none}" +
    ".ika-acik .ika-btn .ika-x{display:block}.ika-acik .ika-btn .ika-ic{display:none}" +
    ".ika-panel{position:fixed;right:24px;bottom:92px;z-index:2147483000;width:400px;height:min(640px,calc(100vh - 120px));" +
    "background:#fff;border:1px solid #E5E7EB;border-radius:16px;overflow:hidden;box-shadow:0 16px 40px rgba(15,23,42,.18);" +
    "opacity:0;transform:translateY(8px);visibility:hidden;transition:opacity .16s ease,transform .16s ease,visibility 0s linear .16s}" +
    ".ika-acik .ika-panel{opacity:1;transform:none;visibility:visible;transition:opacity .16s ease,transform .16s ease}" +
    ".ika-panel iframe{display:block;width:100%;height:100%;border:0}" +
    "@media (max-width:640px){.ika-btn{right:16px;bottom:16px;width:56px;height:56px;padding:0;justify-content:center}" +
    ".ika-btn .ika-etiket{display:none}" +
    ".ika-panel{inset:0;width:auto;height:100%;border:0;border-radius:0;transform:none}" +
    ".ika-acik .ika-btn{display:none}}" +
    "@media (prefers-reduced-motion:reduce){.ika-panel,.ika-acik .ika-panel{transition:none;transform:none}}";

  var stil = document.createElement("style");
  stil.textContent = css;
  document.head.appendChild(stil);

  var kok = document.createElement("div");
  kok.className = "ika-kok";

  var buton = document.createElement("button");
  buton.type = "button";
  buton.className = "ika-btn";
  buton.setAttribute("aria-expanded", "false");
  buton.setAttribute("aria-controls", "ika-panel");
  buton.setAttribute("aria-label", "Pusula İK Asistanını aç");
  buton.title = "Pusula · İşmer İK Asistanı";
  // Pusula işareti: halka içinde pusula iğnesi
  buton.innerHTML =
    '<svg class="ika-ic" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.7" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.4"/><g transform="rotate(40 12 12)"><path d="M12 4.4 14.6 12H9.4Z" fill="#fff"/><path d="M9.4 12h5.2L12 19.6Z" fill="#fff" fill-opacity=".5"/></g><circle cx="12" cy="12" r="1.5" fill="#0033A1"/></svg>' +
    '<svg class="ika-x" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
    '<span class="ika-etiket">Pusula\'ya Sor</span>';

  var panel = document.createElement("div");
  panel.className = "ika-panel";
  panel.id = "ika-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Pusula İK Asistanı");

  var iframe = null;
  var acik = false;

  function ac() {
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.title = "Pusula İK Asistanı";
      if (typeof window.IKA_SRCDOC === "string") iframe.srcdoc = window.IKA_SRCDOC; // önizleme dosyası için
      else iframe.src = sohbetAdresi;
      iframe.addEventListener("load", function () { if (acik) bildir(); });
      panel.appendChild(iframe);
    }
    acik = true;
    kok.classList.add("ika-acik");
    buton.setAttribute("aria-expanded", "true");
    buton.setAttribute("aria-label", "Pusula İK Asistanını kapat");
    bildir();
  }
  function kapat() {
    acik = false;
    kok.classList.remove("ika-acik");
    buton.setAttribute("aria-expanded", "false");
    buton.setAttribute("aria-label", "Pusula İK Asistanını aç");
    buton.focus();
  }
  function bildir() {
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: "ika:acildi" }, "*");
      try { iframe.focus(); } catch (e) {}
    }
  }

  buton.addEventListener("click", function () { acik ? kapat() : ac(); });
  window.addEventListener("message", function (e) {
    if (iframe && e.source === iframe.contentWindow && e.data && e.data.type === "ika:kapat") kapat();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && acik) kapat(); });

  kok.appendChild(panel);
  kok.appendChild(buton);
  (document.body || document.documentElement).appendChild(kok);
})();
