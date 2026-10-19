# Pusula – İşmer İK Asistanı

İşmer portalı için çalışanların İK sorularını (izin, bordro, sağlık sigortası, yemek kartı, e-posta vb.) yanıtlayan sohbet botu. Botun adı **Pusula**. Bot Gemini ile çalışıyor, Cloudflare üzerinde 7/24 yayında kalıyor.
Nasıl çalıştığı: `KURGU.md`.

## Klasörler

| Yol | Ne |
|---|---|
| `data/sss.xlsx` | SSS'nin asıl kaynağı. Değişiklikleri buradan yapın |
| `public/chat.html` | Sohbet penceresi |
| `public/embed.js` | Portala eklenen buton ve pencere |
| `public/index.html` | Portal ana sayfasının temsili kopyası (demo için) |
| `src/worker.js` | Sunucu: kontroller, limitler, Gemini bağlantısı |
| `src/prompt.js` | Botun kuralları (sistem talimatı) |
| `dist/onizleme.html` | API'siz, tek dosyalık demo |

## Kurulum (ilk sefer, yaklaşık 30 dk)

### 1. Gemini API anahtarı
1. https://aistudio.google.com adresine şirket ya da kişisel Google hesabıyla girin.
2. **Get API key** → **Create API key** ile anahtarı oluşturup bir yere kopyalayın.
3. Anahtarı kimseyle paylaşmayın, sohbete de yapıştırmayın. Sadece 5. adımda kullanılacak.
4. Ücretsiz katmanda Google içerikleri ürün geliştirmede kullanabiliyor ve limitler düşük. Demo için yeterli. Pilotta şirket hesabında faturalandırmayı açıp bütçe uyarısı kurun.

### 2. Cloudflare hesabı
https://dash.cloudflare.com/sign-up adresinden ücretsiz hesap açın. E-postanızı doğrulayın.

### 3. Bilgisayara Node.js
https://nodejs.org adresinden **LTS** sürümünü kurun.

### 4. Projeyi hazırlayın
Zip'i açın. Klasörde bir terminal açın (Windows: klasörde boş alana Shift + sağ tık → "Terminalde aç") ve şunu çalıştırın:
```
npm install
```

### 5. Yayına alın
```
npx wrangler login
npx wrangler deploy
npx wrangler secret put GEMINI_API_KEY
```
- `login` tarayıcıyı açar, Cloudflare'a izin verin.
- `deploy` sonunda adresi yazar, örneğin `https://ismer-ik-asistan.<hesabınız>.workers.dev`.
- `secret put` anahtarı ister. Anahtarı yapıştırıp Enter'a basın (ekranda görünmez, bu normal).

### 6. Deneyin
Adresi telefonda açın, sağ alttaki **Pusula'ya Sor** butonuna dokunun.
Kontrol için: `<adres>/api/saglik` adresinde `"anahtar": true` görünmeli.

## SSS'yi güncellemek
1. `data/sss.xlsx` dosyasını düzenleyin. Sütunlar: No, Kategori, Soru, Cevap.
   - No her soru için farklı olmalı.
   - Kategori `Konu / Alt başlık` biçimindedir (ör. `İzinler / İzin Hakları`). Sohbet ekranında `/` öncesi konu kutusu olur; alt başlık isteğe bağlıdır. Yeni bir konu adı yazarsanız ekranda yeni bir kutu açılır.
2. `python scripts/sss_guncelle.py` (Python ve `pip install openpyxl` gerekir)
3. `npx wrangler deploy`

## Botun kurallarını değiştirmek
`src/prompt.js` dosyasını düzenleyip `npx wrangler deploy` çalıştırın.

## Model veya limitleri değiştirmek
`wrangler.jsonc` → `vars` bölümü. Model adı AI Studio'daki model listesinden birebir kopyalanmalı.

## Portala ekleme (BT için)
Portal sayfalarının `</body>` etiketinden hemen önce şu satır eklenir:
```html
<script src="https://ismer-ik-asistan.<hesap>.workers.dev/embed.js" defer></script>
```
Buton ve pencere portalın stillerinden bağımsızdır (`ika-` önekli sınıflar, sohbet iframe içinde). Portal, iframe içeriğine izin veren bir Content-Security-Policy kullanıyorsa `frame-src` listesine asistan adresi eklenmelidir.

## Kendi bilgisayarınızda test (isteğe bağlı)
`.dev.vars.example` dosyasını `.dev.vars` adıyla kopyalayın, anahtarı yazın. Sonra `npm run dev` ile http://localhost:8787 adresini açın.

## Testler
`npm test` sunucu kodunu sahte Gemini cevabıyla dener (gerçek API çağrısı yapmaz).

## Önizleme dosyasını yenilemek
`python scripts/onizleme_olustur.py` → `dist/onizleme.html`
