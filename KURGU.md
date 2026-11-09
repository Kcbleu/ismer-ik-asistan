# Pusula (İK Asistanı) – Nasıl Çalışır?

Portalın sağ altında "Pusula'ya Sor" butonu durur. Çalışan tıklar, sohbet penceresi açılır. Bir konu kutusundan hazır soru seçer ya da sorusunu kendi cümleleriyle yazar. Kapsam: sağlık sigortası, izinler, maaş ve bordro, yemek/ulaşım kartı, çalışma hayatı, e-posta ve şifre, şube işlemleri, şirket ve başvuru. Bot yalnızca İK'nın SSS listesindeki cevapları verir.

Pusula yapay zekâ kullanmaz. Soruyu bir arama algoritması SSS listesinde arar. Hiçbir dış servise bağlanmaz, API anahtarı ya da token gerekmez, soru çalışanın telefonundan/bilgisayarından dışarı çıkmaz. Maliyeti sıfırdır.

## Akış

```
Çalışan (portal / telefon)
   │  1. Soruyu yazar ya da listeden seçer
   ▼
Sohbet penceresi (chat.html + eslestirici.js, çalışanın tarayıcısında)
   │  2. Metni sadeleştirir: küçük harf, ş→s ı→i, "izinnnn"→"izinn", "slm"→"selam"
   │  3. Selamlaşma/teşekkür mü? → hazır cevap
   │  4. Her kelimeyi SSS'deki kelimelere yazım hatası payıyla eşler
   │  5. Eş anlamlıları ekler (karım = eşim, bebeğim = çocuğum)
   │  6. Her SSS maddesine puan verir
   ▼
Karar
   ├─ Emin        → Cevap + kaynak satırı + 2 ilgili soru
   ├─ Kararsız    → "Aşağıdakilerden birini mi soruyorsunuz?" + 2-3 soru butonu
   ├─ Bulunamadı  → İK'ya yönlendirme + "Konulara göz atın"
   └─ Konu dışı   → "Bu konuda yardımcı olamıyorum…"
```

Cevap ~10 ms'de hazırlanır. Ekranda kısa bir "yazıyor" göstergesi bilerek bırakıldı.

## Yazım hatalarını nasıl tolere eder

| Hata türü | Örnek | Nasıl |
|---|---|---|
| Türkçe karakter yok | cocugum, sifre | Harfler sadeleştirilir |
| Harf eksik, fazla, yer değiştirmiş, yan tuş | sgorta, bordorma, aktf | Harf farkı sayılır (Damerau-Levenshtein). 4-5 harfli kelimede 1, daha uzunlarda 2 harf farkına izin verilir |
| Ekler | izinlerimi, sigortaya | Kelimenin baş kısmı (kök) karşılaştırılır |
| Ses yumuşaması | kaybettim / kaybedilmesi | d/t, b/p, g/k farkı yarım hata sayılır |
| Konuşma dili | görcem, istiyom, tasinicam | Kök eşleşmesi bunları yakalar |
| Kısaltma | slm, mrb, nsl, tşk, ik, mail | Kısaltma listesi (eslestirici.js) |
| Bitişik yazım | yemekkartım, varmı | Kelime ikiye bölünüp denenir |
| Başka kelime | karım, uniforma | Excel'deki Sözlük sayfası |
| Hiç benzemeyen ifade | "mesai saatleri kaçta" | Excel'deki Alternatif İfadeler sütunu |

Doğru maddeyi bulmaya yardım eden kurallar:
- Kullanıcının yan yana yazdığı iki kelime bir soruda ya da alternatif ifadede de yan yana geçiyorsa ("bordrom gelmedi") madde ek puan alır.
- Hatalı yazılmış soru kelimeleri ("ne zman", "nerde", "olcak", "hnagi") anlamsız kelime sayılır, soruyu bozmaz.
- Uzun, sohbet havasındaki mesajlarda ("merhaba ben Ahmet, 3 yıldır çalışıyorum…") isim, hitap ve fiiller ("hocam", "eskidi", "hatırlamıyorum") oranı düşürmez. Bot, SSS'de karşılığı olan kelimelere bakar.

Yanlış cevabı önleyen kurallar:
- Kelimenin SSS'de birebir karşılığı varsa bulanık eşleme yapılmaz ("kartım" kelimesi "karım"a eşlenmez).
- Doğrudan cevap için birinci aday ikinciden belirgin önde olmalı. Kısa sorularda kelimelerin en az yarısı, uzun mesajlarda SSS'de karşılığı olan kelimelerin yarısından fazlası tanınmalı.
- Sadece cevap metninde geçen kelimeler zayıf kanıt sayılır. "Yeni başladım, yemek kartı ne zaman verilir" sorusu, cevabında "yeni kart" geçen kayıp kart maddesine gitmez.
- Soruda SSS'de hiç geçmeyen bir isim varsa ("en yakın eczane", "araba sigortası"), tek bir ortak kelime cevap verdirmeye yetmez. En fazla "Bunu mu soruyorsunuz?" diye sorulur.

## İK'nın bakım işi (data/sss.xlsx)

| Sayfa | Ne yazılır |
|---|---|
| SSS | No, Kategori, Soru, Cevap. **Alternatif İfadeler:** çalışanların aynı soruyu nasıl sorabileceği, her biri ayrı satırda (hücre içinde Alt+Enter). **Giriş:** cevabın başına eklenecek kısa cümle, ör. "Başınız sağ olsun." |
| Sözlük | Aynı anlama gelen kelimeler (Kavram + virgülle Kelimeler) |
| Sohbet | Selam, teşekkür, "sen kimsin" gibi ifadelerin cevapları ve botun hazır mesajları (öneri, bulunamadı, konu dışı, boş cevap) |

Bot zamanla, çalışanların gerçekte nasıl sorduğu Alternatif İfadeler'e eklendikçe iyileşir. Bir maddeye eklenen ifade başka bir maddeyi bozabilir; bu yüzden her değişiklikten sonra `npm test` çalıştırılır.

## Ekrandaki durumlar

| Durum | Ne görünür |
|---|---|
| İlk açılış | Karşılama, 8 konu kutusu ve boş yazı alanı. Konuya dokununca o konunun soruları listelenir |
| Cevap bulundu | Cevap, altında kaynak satırı ve aynı konudan 2 ilgili soru |
| Kararsız | "Aşağıdakilerden birini mi soruyorsunuz?" ve 2-3 soru butonu (tek aday varsa "Bunu mu soruyorsunuz?") |
| Cevap boş (Provizyon) | "Elimde net bir bilgi yok, İK ile iletişime geçin (insan.kaynaklari@ismer.com.tr)" |
| Bulunamadı / konu dışı | İlgili mesaj ve "Konulara göz atın" butonu |
| Selam, teşekkür | Sohbet sayfasındaki kısa cevap |
| Kısa takip sorusu | "peki eşim?" bir önceki cevabın konusuyla birlikte değerlendirilir |
| 300 karaktere yaklaşınca | Sayaç görünür (ör. 280/300) |

## Kalite kontrolü

`npm test` şunları dener:
- Listedeki her soru ve her alternatif ifade kendi maddesini bulmalı.
- `data/test_sorular.xlsx` içindeki sorular beklenen maddeye gitmeli. Yanlış cevap olmamalı; doğru madde öneri listesinde çıkarsa kabul edilir. Beklenen değeri `-` olan sorular SSS'de olmayan sorulardır: bunlara doğrudan cevap verilmemeli.
- SSS sorularından otomatik üretilen 390 yazım hatalı soruda yanlış cevap oranı %1'i geçmemeli.

Ölçümler:

| Test | Doğrudan doğru | Öneride doğru | Yanlış cevap |
|---|---|---|---|
| test_sorular.xlsx (124 soru: hatalı yazımlar, uzun mesajlar, SSS'de olmayan sorular) | 110 | 14 | 0 |
| Otomatik bozulmuş 390 soru | %96,4 | %3,3 | %0,3 (1 soru: birbirine çok benzeyen 5 ve 8. maddeler) |
| Algoritma ayarlanırken hiç kullanılmayan 30 soru | 24 | 6 | 0 |

Son satırdaki 30 soruda ilk sürüm 22 doğru, 4 öneri, 1 yanlış cevap ve 3 bulunamadı vermişti. Bu sorular ölçümden sonra test listesine eklendi.

Soruları proje ekibi yazdı. Gerçek başarıyı pilotta çalışanların yazdığı sorular gösterecek; o sorular da test listesine eklenmeli.

## Sınırlar

- Cevap SSS'deki metnin aynısıdır, soruya göre kısaltılmaz. Örneğin "annem vefat etti" sorusunda tüm yakınlık dereceleri listelenir. Gerekirse uzun maddeler alt maddelere bölünebilir.
- Tek mesajdaki iki ayrı soru ve olumsuzluk ("izin değil rapor") iyi anlaşılmaz.
- Bulunamayan sorular kaydedilmez (karar gereği). İK, neyin eksik olduğunu çalışanlardan ve sahadan gelen geri bildirimle öğrenir.

## Barındırma

Şu an Cloudflare'da duruyor. Sunucu kodu yoktur, yalnızca `public/` klasöründeki dosyalar sunulur. Portalın kendi sunucusuna taşınırken bu klasörü kopyalamak yeterlidir.

## Açık konular

- **Provizyon cevabı:** "Provizyon alamazsam ne yapmalıyım?" sorusunun cevabı İK'dan alınmalı.
- **İK iletişim bilgisi:** Bot cevap bulamayınca insan.kaynaklari@ismer.com.tr adresini veriyor. Sahadaki çalışanlar için doğru kanal bu mu, yoksa telefon mu verilmeli, İK teyit etmeli. Adres Excel'in Sohbet sayfasında ve `public/chat.html` içinde (bağlantı hatası mesajı) geçiyor.
- **Font:** Portal fontu Ubuntu olarak görünüyor, BT'den teyit edilmeli.
- **Portal sunucusuna taşıma:** Tarih ve adres BT ile netleştirilmeli.

## Sonraki aşamalar

1. Pilotta çalışanların yazdığı sorularla test listesini ve alternatif ifadeleri zenginleştirmek.
2. Portal sunucusuna taşımak.
3. Kapsamı genişletmek: diğer İK SSS'leri, Finans, Bilgi İşlem (her biri yeni satırlar ve sözlük kavramları demek).
