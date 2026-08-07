# SEO Dokümantasyonu — SIN Beauty Studio

Hedef: **"Antalya nail art", "Konyaaltı tırnak", "kalıcı oje Antalya"** gibi yerel aramalarda üst sıralarda çıkmak ve Google/Yandex'te işletme kartıyla görünmek.

---

## 1. Sayfada Uygulanan SEO (kurulu)

| Öğe | Durum | Açıklama |
|-----|-------|----------|
| `<title>` | ✅ | Anahtar kelime + konum içerir |
| `meta description` | ✅ | Çağrı içeren, ~155 karakter, Türkçe |
| `lang="tr"` | ✅ | Türkçe içerik sinyali |
| **Canonical** | ✅ | `https://anllkvk.github.io/sin/` |
| **Open Graph** (og:*) | ✅ | WhatsApp/Facebook paylaşım kartı |
| **Twitter Card** | ✅ | summary kartı |
| **JSON-LD (NailSalon)** | ✅ | Ad, adres, telefon, koordinat, saatler, puan |
| **Geo meta** | ✅ | `geo.region=TR-07`, konum koordinatları |
| **Sitemap** | ✅ | `/sitemap.xml` içine `/sin/` eklendi |
| **robots** | ✅ | `index, follow, max-image-preview:large` |
| **manifest** | ✅ | PWA / telefona ekleme |
| Semantik başlıklar | ✅ | Tek `h1`, bölümler `h2` |
| Mobil uyumlu | ✅ | Responsive, viewport meta |
| Hız | ✅ | ~45 KB, harici resim yok |

---

## 2. Yapısal Veri (JSON-LD)

`<head>` içinde `NailSalon` şeması var. Google bunu **zengin sonuç** (yıldız puanı, adres, saatler) için kullanır:

```json
{
  "@type": "NailSalon",
  "name": "SIN Beauty Studio",
  "telephone": "+905075119200",
  "address": { "streetAddress": "Öğretmenevleri Mah., 922. Sk.", "addressLocality": "Konyaaltı", "addressRegion": "Antalya", "postalCode": "07070" },
  "geo": { "latitude": 36.873005, "longitude": 30.641085 },
  "openingHoursSpecification": [ … 10:00–19:00 … ],
  "aggregateRating": { "ratingValue": "4.7", "reviewCount": "4712" }
}
```

> **Doğrulama:** [search.google.com/test/rich-results](https://search.google.com/test/rich-results) adresine site URL'sini girip test edin.
> **Önemli:** `aggregateRating`, kendi topladığınız/gerçek yorumları yansıtmalıdır; uydurma puan Google politikasına aykırıdır. Buradaki 4.7/4712 değerleri işletmenin gerçek Google/Yandex verisidir.

---

## 3. Hedef Anahtar Kelimeler

**Birincil (yerel niyet):**
- Antalya nail art
- Konyaaltı tırnak / nail art
- kalıcı oje Antalya
- protez tırnak Antalya

**İkincil:**
- manikür pedikür Konyaaltı
- Antalya tırnak tasarımı
- Öğretmenevleri güzellik / tırnak
- SIN Beauty Studio (marka)

Bu kelimeler `title`, `description`, `h1/h2`, hizmet kartları ve `keywords` meta'sına doğal biçimde serpiştirildi.

---

## 4. Yerel SEO — En Kritik Adımlar (site dışı)

Bir tırnak stüdyosu için **en yüksek etki** buradadır:

1. **Google Business Profile (Google İşletme Profili)**
   - [business.google.com](https://business.google.com) → işletmeyi sahiplenin/doğrulayın.
   - Web sitesi alanına **`https://anllkvk.github.io/sin/`** ekleyin.
   - Kategori: *Nail Salon / Tırnak Salonu*. Foto, hizmet, saat ekleyin.
   - Bu, Google Haritalar ve "yakınımdaki nail art" aramaları için şarttır.

2. **Yandex İşletme**
   - Yandex Haritalar kartında (mevcut) **"Web sitesi ekle"** ile site URL'sini girin.
   - Kart zaten 4.712 yorumla mevcut — güncel tutun.

3. **NAP tutarlılığı** — İsim, Adres, Telefon her yerde **birebir aynı** olmalı (site, Google, Yandex, Instagram). Tutarsızlık yerel sıralamayı düşürür.

4. **Yorum toplama** — Müşterilerden düzenli Google yorumu isteyin. Yorum sayısı + tazeliği yerel sıralamada güçlü sinyaldir.

5. **Instagram bağlantısı** — Profil bio'suna site linkini ekleyin (`sameAs` sinyali).

---

## 5. Yayın Sonrası Yapılacaklar (checklist)

- [ ] **Google Search Console**'a `anllkvk.github.io` mülkünü ekleyin, `sitemap.xml` gönderin.
- [ ] **Rich Results Test** ile JSON-LD'yi doğrulayın.
- [ ] **PageSpeed Insights** ile mobil skoru kontrol edin (hedef 90+).
- [ ] Google Business Profile'a site linkini ekleyin.
- [ ] Yandex kartına site linkini ekleyin.
- [ ] Instagram bio'suna link koyun.
- [ ] Gerçek stüdyo fotoğraflarını ekleyin (görsel SEO + dönüşüm).

---

## 6. İçerik Fikirleri (sıralamayı büyütmek için)

Tek sayfa iyi bir başlangıç. Zamanla eklenebilecek, arama trafiği çeken içerikler:
- **Fiyat / Hizmet detay sayfası** (uzun kuyruk kelimeler).
- **Blog / Bakım ipuçları** ("Kalıcı oje kaç gün dayanır?", "Protez tırnak bakımı") — bilgi amaçlı aramalar.
- **Sık Sorulan Sorular (FAQ)** bölümü + `FAQPage` JSON-LD (Google'da açılır soru kartları).

---

## 7. Ölçüm

- **Google Search Console** — hangi kelimelerde göründüğünüz, tıklama oranı.
- **Google Business Profile Insights** — arama/harita görüntülenmeleri, yol tarifi, arama tıklamaları.
- Basit ve gizlilik dostu analitik isterseniz: Plausible / Umami (opsiyonel, `<head>`'e tek script).

---

## 8. Özet

Sayfa içi SEO **tamamdır**. Bir yerel işletme için sıralamayı asıl belirleyen **Google Business Profile + yorumlar + NAP tutarlılığı**dır (Bölüm 4). Site canlıya alındıktan sonra Bölüm 5 kontrol listesini uygulayın.
