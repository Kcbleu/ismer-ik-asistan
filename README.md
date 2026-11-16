# İşmer Asistan

Çalışanların İK sorularını (izin, bordro, sağlık sigortası, yemek kartı, e-posta vb.) yanıtlayan sohbet botu. Botun adı **İşmer Asistan**. İK'nın mobil uygulamasına eklenecek; asıl kullanıcıları bilgisayarı olmayan mavi yaka çalışanlar (temizlik, güvenlik, teknik personel). Yapay zekâ ya da dış servis kullanmaz: soruyu yazım hatalarına toleranslı bir arama algoritmasıyla SSS listesinde bulur.

Nasıl çalıştığı, soru türleri (genel / gruba göre / kişiye özel) ve fazlar (SSS botu → İK'ya otomatik talep → kişiye özel cevap): `KURGU.md`.

## Klasörler

| Yol | Ne |
|---|---|
| `data/sss.xlsx` | SSS'nin asıl kaynağı: sorular, alternatif ifadeler, sözlük, sohbet cevapları. Değişiklikleri buradan yapın |
| `data/test_sorular.xlsx` | Botun doğru cevaplaması gereken örnek sorular (Test sayfası) ve çok adımlı sohbetler (Senaryolar sayfası). npm test kullanır |
| `public/chat.html` | Sohbet ekranı (mobil uygulamada tam ekran açılan sayfa) |
| `public/eslestirici.js` | Soruyu SSS'de bulan algoritma |
| `public/sss.json` | Excel'den üretilen veri. Elle düzenlemeyin |
| `public/embed.js` | Portal (web) sürümü için buton, tanıtım kartı ve pencere. Mobil uygulamada kullanılmaz |
| `public/assets/` | Kurumsal logodan kırpılmış görseller: tam logo, amblem (kuleler + İŞMER), yalnızca kuleler |
| `public/index.html` | Portal ana sayfasının temsili kopyası (demo için) |
| `scripts/` | Excel dönüştürme, test ve önizleme betikleri |
| `dist/onizleme.html` | Tek dosyalık demo (npm run onizleme ile üretilir) |

## Kurulum (ilk sefer)

1. https://nodejs.org adresinden **LTS** sürümünü kurun.
2. Klasörde bir terminal açın (Windows: klasörde boş alana Shift + sağ tık → "Terminalde aç") ve çalıştırın:
   ```
   npm install
   ```
3. Cloudflare'a yayınlamak için (ücretsiz hesap: https://dash.cloudflare.com/sign-up):
   ```
   npx wrangler login
   npx wrangler deploy
   ```
   `deploy` sonunda adresi yazar, örneğin `https://ismer-ik-asistan.<hesabınız>.workers.dev`. API anahtarı ya da başka bir ayar gerekmez.
4. Telefonda `.../chat.html` adresini açın: mobil uygulamada görünecek sohbet ekranı budur. Ana adres (`/`) portal demosunu açar.

## SSS'yi güncellemek

1. `data/sss.xlsx` dosyasını düzenleyin.
   - **SSS sayfası:** No, Kategori, Soru, Cevap, Alternatif İfadeler, Giriş, Personel Grubu.
     - No her soru için farklı olmalı. Tek istisna: cevabı personel grubuna göre değişen soru. Her grup için aynı No ile ayrı satır açılır, Personel Grubu sütununa grup adı yazılır (ör. 16. madde: "Banka PDH personeli" ve "Ofis personeli"). Kategori, Soru ve Alternatif İfadeler ilk satırdan okunur.
     - Kategori `Konu / Alt başlık` biçimindedir (ör. `İzinler / İzin Hakları`). Sohbet ekranında `/` öncesi konu kutusu olur.
     - Alternatif İfadeler: çalışanların aynı soruyu nasıl sorabileceği, her biri ayrı satırda (hücre içinde Alt+Enter).
   - **Sözlük sayfası:** aynı anlama gelen kelimeler (ör. `kıyafet` → `üniforma, iş elbisesi, ayakkabı`). Kavramları dar tutun ("brüt" ile "maaş" ayrı) ve kelimelerin ekli hâlini yazın ("babam", "annem"; çıplak "baba" yazılırsa "babalık izni" de bu kavrama karışır).
   - **Sohbet sayfası:** selam, teşekkür gibi mesajların cevapları ve botun hazır mesajları. Tür adlarını değiştirmeyin.
   - **Personel Grupları sayfası:** Grup (SSS sayfasındaki adla aynı), Seçenek (botun "Hangi gruptasınız?" sorusundaki buton metni), Anahtar Kelimeler (çalışan mesajında yazarsa grup sorulmadan anlaşılır: "ofis"; "banka, pdh"). Anahtar kelimeler SSS sorularında geçmemeli.
2. `npm run sss` (Excel'i `public/sss.json`'a çevirir)
3. `npm test` (yeni ifadeler başka soruları bozdu mu diye kontrol eder)
4. `npx wrangler deploy`

Bot bir soruyu yanlış maddeye götürüyorsa: o soruyu doğru maddenin Alternatif İfadeler hücresine ekleyin ya da eksik eş anlamlıyı Sözlük sayfasına yazın. Soruyu `data/test_sorular.xlsx`'e de ekleyin, sonra 2-4. adımları tekrarlayın. `npm test -- --detay` öneriye düşen soruları da listeler.

## Mobil uygulamaya ekleme (uygulama geliştiricisi için)

Önerilen yol, uygulamaya bir "İK Asistanı" menüsü eklemek ve bu menünün `chat.html` adresini uygulama içi web görünümünde (Android WebView, iOS WKWebView, Flutter `webview_flutter`, React Native `react-native-webview`) tam ekran açması.
- Sayfa sunucu kodu gerektirmez; `public/` klasörü herhangi bir web sunucusunda yayınlanabilir. SSS güncellemesi uygulama güncellemesi gerektirmez.
- JavaScript açık olmalı. Yerel depolama (localStorage) açık olursa çalışanın personel grubu hatırlanır; kapalıysa bot grubu her seferinde sorar.
- Sayfa bir kez yüklendikten sonra cevaplar telefonda üretilir; internet gerekmez.
- Uygulamanın kendi geri tuşu/başlığı kullanılabilir. Sohbet ekranındaki kapatma butonu yalnızca portal penceresinde görünür.

2. ve 3. faz (İK'ya otomatik talep, kişiye özel cevap) için uygulamanın giriş yapmış çalışanın kimliğini sohbet ekranına güvenli biçimde iletmesi ve bir sunucu bileşeni gerekir; ayrıntılar ve uygulama geliştiricisine sorulacaklar `KURGU.md`'de.

## Portala ekleme (isteğe bağlı, BT için)

Bot önce portal için hazırlandı; portalda da kullanılabilir. Portal sayfalarının `</body>` etiketinden hemen önce şu satır eklenir:
```html
<script src="https://ismer-ik-asistan.<hesap>.workers.dev/embed.js" defer></script>
```
Buton ve pencere portalın stillerinden bağımsızdır (`ika-` önekli sınıflar, sohbet iframe içinde). Portal, iframe içeriğine izin veren bir Content-Security-Policy kullanıyorsa `frame-src` listesine asistan adresi eklenmelidir.

Bu satır sağ alta logolu **İşmer Asistan** butonunu ve ilk ziyarette butonun üstünde çıkan tanıtım kartını ekler. İsteğe bağlı ayarlar:
- Tanıtım kartını kapatmak: script etiketine `data-tanitim="kapali"` eklenir.
- Portaldaki herhangi bir bağlantı, menü öğesi ya da hızlı erişim kutucuğu asistanı açabilir: elemana `data-ismer-asistan` eklenir. Değer verilirse o soru da sorulur: `data-ismer-asistan="Kaç gün iznim kaldı?"`. Betikten: `IsmerAsistan.ac()`, `IsmerAsistan.sor("...")`.
- Tanıtım kartı kapatıldıktan sonra 30 gün çıkmaz. Denemek için sayfa adresinin sonuna `?ika-tanitim` eklenir.

**Portalın kendi sunucusuna taşıma:** `public/` klasörünün içeriği portal sunucusunda bir klasöre (ör. `/ismer-asistan/`) kopyalanır ve yukarıdaki satırdaki adres o klasörü gösterecek şekilde değiştirilir. Sunucu tarafında çalışan bir kod yoktur.

## Kendi bilgisayarınızda deneme

- `npm run dev` ile http://localhost:8787/chat.html (mobil ekran) ya da http://localhost:8787 (portal demosu) adresini açın. Bilgisayarda telefon görünümü için tarayıcının geliştirici araçlarında cihaz modunu (Ctrl+Shift+M) kullanın. Ya da
- `npm run onizleme` ile `dist/onizleme.html` dosyasını üretip çift tıklayın (sunucu gerekmez, telefona da gönderilebilir).

## Testler

`npm test` eşleştiriciyi dener ve sonuçları yazar: doğrudan doğru, öneri listesinde doğru ve yanlış cevaplar. Yanlış cevap çıkarsa test geçmez.
