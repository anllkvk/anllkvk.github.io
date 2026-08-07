# SIN Beauty Studio — Web Sitesi

Antalya Konyaaltı'ndaki SIN Beauty Studio için hazırlanmış tek sayfalık profesyonel web sitesi.
Yayında: **https://anllkvk.github.io/sin/**

## İçerik
- `index.html` — Tüm site (HTML + CSS + JS tek dosyada, harici bağımlılık yok)
- `favicon.svg` — Site ikonu / logo
- `manifest.webmanifest` — Telefona eklenebilir PWA manifesti
- `docs/FRONTEND.md` — Ön yüz mimarisi ve düzenleme rehberi
- `docs/BACKEND.md` — Randevu formu / backend entegrasyon seçenekleri
- `docs/SEO.md` — SEO stratejisi ve yayın sonrası kontrol listesi

## Yerel önizleme (canlıya almadan görmek için)
```bash
cd anllkvk.github.io
python3 -m http.server 8000
# Tarayıcıda açın:  http://localhost:8000/sin/
```
Build adımı yok — dosyayı kaydedip tarayıcıyı yenilemeniz yeterli.

## Gerçek fotoğrafları ekleme
Site şu an zarif gradient görsellerle ve yedekli (fallback) Unsplash fotoğraflarıyla çalışır.
Gerçek Instagram / stüdyo fotoğraflarını koymak için:

1. Fotoğrafları bu klasöre koyun (örn. `foto1.jpg`).
2. `index.html` içinde `<img class="ph" ... src="...">` satırlarını bulun ve `src` değerini kendi dosyanızla değiştirin, örn: `src="foto1.jpg"`.
3. Galeri bölümündeki renkli kutuları (`<div class="ph g1"></div>`) fotoğrafla değiştirmek için yerine `<img class="ph" src="galeri1.jpg" alt="...">` yazabilirsiniz.

## Bilgiler
- **Adres:** Öğretmenevleri Mah., 922. Sk., 07070 Konyaaltı / Antalya
- **Telefon:** 0507 511 92 00
- **Instagram:** [@sin.beautybar](https://www.instagram.com/sin.beautybar/)
- **Çalışma saatleri:** Pzt–Cmt 10:00–19:00, Pazar kapalı
