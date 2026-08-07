# Frontend Dokümantasyonu — SIN Beauty Studio

Bu doküman sitenin ön yüz (frontend) mimarisini, yapısını ve nasıl düzenleneceğini anlatır.

---

## 1. Teknoloji & Yaklaşım

| Konu | Seçim | Neden |
|------|-------|-------|
| Yapı | **Saf HTML + CSS + Vanilla JS** (tek dosya) | Sıfır build adımı, sıfır bağımlılık, çok hızlı yüklenir |
| Barındırma | **GitHub Pages (Jekyll)** | Ücretsiz, otomatik yayın, SSL dahil |
| Font | Google Fonts — *Playfair Display* (başlık) + *Jost* (metin) | Yüksek kontrastlı editorial serif + modern sans; `display=swap` |
| Görseller | **`img/` klasöründeki foto + CSS gradient fallback** | Foto yoksa gradient; foto eklenince otomatik yüklenir, hiç bozulmaz |
| Palet | Premium **lacivert + altın + krem** | Referans (Perla Nail Beauty) stilinde lüks görünüm |
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

1. **Duyuru barı** — "Son 2 randevu kaldı" + WhatsApp (kampanya/aciliyet).
2. **Nav** — Altın çerçeveli pill menü; **Kurumsal** ve **Hizmetlerimiz** açılır menüleri, **TR·EN·RU·AR** dil seçici (TR aktif, diğerleri "yakında"), altın "Randevu Al", mobil hamburger.
3. **Hero** — "Tırnak İşlemleri & Nail Art" başlığı (altın &), alt metin, CTA, istatistikler (4.7 / 4.700+ / 10+), foto/gradient görsel + puan rozeti.
4. **Marquee** — Kayan hizmet şeridi.
5. **İlham Galerisi** (`#galeri`) — 6 kutuluk masonry grid, tıklayınca **lightbox** ile büyütme ("İncele & Büyüt").
6. **Hizmetler** (`#hizmetler`) — 6 kart (Nail Art, Kalıcı Oje, Protez Tırnak, Jel Güçlendirme, Manikür, Pedikür).
7. **Hakkımızda** (`#hakkimizda`) — Lacivert bölüm, değer listesi + görsel.
8. **Yorumlar** (`#yorumlar`) — 4.7 özet + 3 gerçek Google yorumu.
9. **CTA bandı** — "Ellerinizi şımartmanın zamanı geldi" + WhatsApp.
10. **İletişim** (`#iletisim`) — Adres/telefon/saatler + **Hızlı Randevu formu** + Yandex harita.
11. **Footer** — Logo, Kurumsal/Hizmetler/İletişim, sosyal ikonlar.
12. **Yüzen CTA** — Sağ altta sabit WhatsApp + telefon butonları.

---

## 4. Tasarım Sistemi (CSS Değişkenleri)

`index.html > <style> > :root` içinde tanımlıdır. Renk/ölçü değiştirmek için tek yer burasıdır:

```css
--navy:#0f2439;      /* lacivert — koyu zeminler (nav badge, about, footer, CTA) */
--navy-2:#183350;    /* açık lacivert */
--gold:#c9a24b;      /* altın — vurgu, çerçeve, butonlar */
--gold-soft:#e7d09a; /* açık altın — koyu zemin üstü metin */
--cream:#f7f2ea;     /* krem — ana zemin */
--card:#fffdf9;      /* kart zemini */
--radius:20px;       /* köşe yuvarlaklığı */
--maxw:1200px;       /* içerik genişliği */
```

**Tipografi:** `--serif` = Playfair Display (başlıklar), `--sans` = Jost (metin). Başlık boyutları `clamp()` ile responsive.

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

## 6. Gerçek Fotoğraf Ekleme (kod gerektirmez)

Site, `img/` klasöründeki dosyaları **otomatik** yükler. Dosya yoksa zarif gradient gösterir (site asla bozuk görünmez), dosya eklenince otomatik görünür.

Beklenen dosya adları (tam liste `img/README.md` içinde):

| Dosya | Yer |
|-------|-----|
| `img/hero.jpg` | Hero büyük görsel |
| `img/nail-1.jpg` … `img/nail-6.jpg` | İlham Galerisi |
| `img/salon.jpg` | Hakkımızda görseli |

**Ekleme:** GitHub'da `sin/img/` klasörü → *Add file → Upload files* → dosyaları bu adlarla yükleyip commit edin.

**Öneri:** JPG/WebP, genişlik ~1000–1400px, < 250 KB (hız için). Galeri etiketlerini değiştirmek için `index.html`'deki `data-cap` değerlerini düzenleyin.

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
