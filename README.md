# Pusula – İşmer İK Asistanı

İşmer portalı için çalışanların İK sorularını (izin, bordro, sağlık sigortası, yemek kartı, e-posta vb.) yanıtlayan sohbet botu. Botun adı **Pusula**. Yapay zekâ ya da dış servis kullanmaz: soruyu yazım hatalarına toleranslı bir arama algoritmasıyla SSS listesinde bulur. Şu an Cloudflare üzerinde statik dosya olarak yayında.
Nasıl çalıştığı: `KURGU.md`.

## Klasörler

| Yol | Ne |
|---|---|
| `data/sss.xlsx` | SSS'nin asıl kaynağı: sorular, alternatif ifadeler, sözlük, sohbet cevapları. Değişiklikleri buradan yapın |
| `data/test_sorular.xlsx` | Botun doğru cevaplaması gereken örnek sorular (npm test kullanır) |
| `public/chat.html` | Sohbet penceresi |
| `public/eslestirici.js` | Soruyu SSS'de bulan algoritma |
| `public/sss.json` | Excel'den üretilen veri. Elle düzenlemeyin |
| `public/embed.js` | Portala eklenen buton ve pencere |
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
4. Adresi telefonda açın, sağ alttaki **Pusula'ya Sor** butonuna dokunun.

## SSS'yi güncellemek

1. `data/sss.xlsx` dosyasını düzenleyin.
   - **SSS sayfası:** No, Kategori, Soru, Cevap, Alternatif İfadeler, Giriş.
     - No her soru için farklı olmalı.
     - Kategori `Konu / Alt başlık` biçimindedir (ör. `İzinler / İzin Hakları`). Sohbet ekranında `/` öncesi konu kutusu olur.
     - Alternatif İfadeler: çalışanların aynı soruyu nasıl sorabileceği, her biri ayrı satırda (hücre içinde Alt+Enter).
   - **Sözlük sayfası:** aynı anlama gelen kelimeler (ör. `kıyafet` → `üniforma, iş elbisesi, ayakkabı`).
   - **Sohbet sayfası:** selam, teşekkür gibi mesajların cevapları ve botun hazır mesajları. Tür adlarını değiştirmeyin.
2. `npm run sss` (Excel'i `public/sss.json`'a çevirir)
3. `npm test` (yeni ifadeler başka soruları bozdu mu diye kontrol eder)
4. `npx wrangler deploy`

Bot bir soruyu yanlış maddeye götürüyorsa: o soruyu doğru maddenin Alternatif İfadeler hücresine ekleyin ve `data/test_sorular.xlsx`'e de yazın, sonra 2-4. adımları tekrarlayın.

## Portala ekleme (BT için)

Portal sayfalarının `</body>` etiketinden hemen önce şu satır eklenir:
```html
<script src="https://ismer-ik-asistan.<hesap>.workers.dev/embed.js" defer></script>
```
Buton ve pencere portalın stillerinden bağımsızdır (`ika-` önekli sınıflar, sohbet iframe içinde). Portal, iframe içeriğine izin veren bir Content-Security-Policy kullanıyorsa `frame-src` listesine asistan adresi eklenmelidir.

**Portalın kendi sunucusuna taşıma:** `public/` klasörünün içeriği portal sunucusunda bir klasöre (ör. `/pusula/`) kopyalanır ve yukarıdaki satırdaki adres o klasörü gösterecek şekilde değiştirilir. Sunucu tarafında çalışan bir kod yoktur.

## Kendi bilgisayarınızda deneme

- `npm run dev` ile http://localhost:8787 adresini açın, ya da
- `npm run onizleme` ile `dist/onizleme.html` dosyasını üretip çift tıklayın (sunucu gerekmez, telefona da gönderilebilir).

## Testler

`npm test` eşleştiriciyi dener ve sonuçları yazar: doğrudan doğru, öneri listesinde doğru ve yanlış cevaplar. Yanlış cevap çıkarsa test geçmez.
