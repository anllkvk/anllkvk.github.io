# Frontend Dokümantasyonu — SIN Beauty Studio

Bu doküman sitenin ön yüz (frontend) mimarisini, yapısını ve nasıl düzenleneceğini anlatır.

---

## 1. Teknoloji & Yaklaşım

| Konu | Seçim | Neden |
|------|-------|-------|
| Yapı | **Saf HTML + CSS + Vanilla JS** (tek dosya) | Sıfır build adımı, sıfır bağımlılık, çok hızlı yüklenir |
| Barındırma | **GitHub Pages (Jekyll)** | Ücretsiz, otomatik yayın, SSL dahil |
| Font | Google Fonts — *Cormorant Garamond* (başlık) + *Jost* (metin) | Zarif serif + modern sans; `display=swap` ile FOIT yok |
| Görseller | **Inline SVG + CSS gradient** | Harici bağımlılık yok, hiçbir ağda kırılmaz, çok küçük |
| İkonlar | Inline SVG + emoji | Ekstra istek yok |

> **Prensip:** Site tamamen kendi kendine yeter. Google Fonts dışında hiçbir harici kaynağa (CDN, resim sunucusu) bağımlı değildir. Bu yüzden yerel önizleme, canlı yayınla birebir aynı görünür.

---

## 2. Dosya Yapısı

```
sin/
├── index.html            # Tüm site (HTML + CSS + JS gömülü)
├── favicon.svg           # Site ikonu / logo işareti
├── manifest.webmanifest  # PWA manifesti (telefona eklenebilir)
├── README.md             # Sahibi için hızlı başlangıç
└── docs/
    ├── FRONTEND.md        # Bu dosya
    ├── BACKEND.md         # Backend / form entegrasyon seçenekleri
    └── SEO.md             # SEO stratejisi ve kontrol listesi
```

---

## 3. Sayfa Bölümleri (sıra ile)

1. **Nav** — Yapışkan (sticky), cam efektli (glassmorphism) üst menü + mobil hamburger menü.
2. **Hero** — Marka başlığı, alt metin, CTA butonları, istatistikler (4.7 / 4.700+ / 10+), SVG görsel + puan rozeti.
3. **Marquee** — Kayan hizmet şeridi (Nail Art, Kalıcı Oje, …).
4. **Hizmetler** (`#hizmetler`) — 6 kartlık grid (Nail Art, Kalıcı Oje, Protez Tırnak, Manikür, Pedikür, Bakım).
5. **Hakkımızda** (`#hakkimizda`) — Alıntı + değer listesi + SVG monogram görseli.
6. **Galeri** (`#galeri`) — 7 kutuluk masonry grid, Instagram'a link.
7. **Yorumlar** (`#yorumlar`) — 4.7 özet + 3 gerçek Google yorumu.
8. **İletişim** (`#iletisim`) — Adres/telefon/saatler kartı + **Hızlı Randevu formu** + Yandex harita.
9. **Footer** — Logo, linkler, sosyal ikonlar.
10. **Yüzen CTA** — Sağ altta sabit WhatsApp + Instagram butonları.

---

## 4. Tasarım Sistemi (CSS Değişkenleri)

`index.html > <style> > :root` içinde tanımlıdır. Renk/ölçü değiştirmek için tek yer burasıdır:

```css
--plum:#2a1723;      /* koyu erik — koyu zeminler, başlıklar */
--cream:#f7f0e8;     /* krem — ana zemin */
--rose:#d99a94;      /* gül — vurgu */
--rose-deep:#b56b64; /* koyu gül — butonlar, linkler */
--gold:#c8a35a;      /* altın — yıldızlar, süsleme */
--radius:22px;       /* köşe yuvarlaklığı */
--maxw:1180px;       /* içerik genişliği */
```

**Tipografi:** `--font-serif` (başlıklar), `--font-sans` (metin). Başlık boyutları `clamp()` ile responsive.

---

## 5. İçeriği Düzenleme (sık işlemler)

| Ne değişecek? | Nerede? |
|---------------|---------|
| Telefon numarası | `tel:+905075119200` ve `wa.me/905075119200` (birden çok yerde — hepsini güncelleyin) |
| Adres | Hero altı yok; `#iletisim` info-row + `<head>` JSON-LD `address` |
| Çalışma saatleri | `#iletisim` `.hours` bloğu + JSON-LD `openingHoursSpecification` |
| Hizmet kartları | `#hizmetler` `.svc` blokları |
| Yorumlar | `#yorumlar` `.rev` blokları |
| Instagram linki | Tüm `instagram.com/sin.beautybar` bağlantıları |

> Bilgi güncellerken **hem görünen metni hem `<head>`'deki JSON-LD yapısal verisini** güncelleyin (SEO tutarlılığı için).

---

## 6. Gerçek Fotoğraf Ekleme

Şu an hero ve hakkımızda görselleri **inline SVG**'dir. Gerçek fotoğrafla değiştirmek için:

1. Fotoğrafı `sin/` klasörüne koyun (örn. `hero.jpg`).
2. İlgili `<svg class="ph art">…</svg>` bloğunu şununla değiştirin:
   ```html
   <img class="ph" src="hero.jpg" alt="SIN Beauty nail art" loading="lazy">
   ```
3. Galeride renkli kutuları (`<div class="ph g1"></div>`) değiştirmek için:
   ```html
   <img class="ph" src="galeri1.jpg" alt="Nail art" loading="lazy">
   ```

**Öneri:** Fotoğrafları yüklemeden önce boyutlandırın (genişlik ~1000–1400px, JPG/WebP, < 200 KB) — hız için önemli.

---

## 7. Responsive Kırılım Noktaları

- `≤ 940px` — Hero tek sütun, hizmet/yorum grid 2 sütun, galeri 2 sütun.
- `≤ 640px` — Menü hamburger'a döner, tüm gridler tek sütun, istatistikler küçülür.

---

## 8. Erişilebilirlik (a11y)

- `İçeriğe geç` skip-link (klavye kullanıcıları için).
- `:focus-visible` görünür odak halkaları.
- Tüm SVG'lerde `role="img"` + `aria-label`; dekoratif olanlarda `aria-hidden`.
- `prefers-reduced-motion` — animasyonlar kapanır.
- Semantik başlık hiyerarşisi (tek `h1`, bölüm `h2`).

---

## 9. Performans

- Tek HTTP isteği (HTML) + fontlar; harici resim/CDN yok.
- `preconnect` ile font sunucusuna erken bağlantı.
- `font-display: swap`.
- Görsel yerine SVG → toplam sayfa ~45 KB.
- `IntersectionObserver` ile tembel (scroll) animasyon; JS kapalıysa `<noscript>` içerik görünür kalır.

---

## 10. Yerel Önizleme

```bash
# Depoyu klonlayın, ardından:
cd anllkvk.github.io
python3 -m http.server 8000
# Tarayıcıda açın:
#   http://localhost:8000/sin/
```

Değişiklik yaptıkça dosyayı kaydedip tarayıcıyı yenilemeniz yeterli (build yok).
