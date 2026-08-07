# Proje Görselleri — buraya render/fotoğrafları koyun

Site aşağıdaki dosya adlarını **otomatik** yükler. Dosya yoksa zarif bir gradient gösterilir (site asla bozuk görünmez); dosyayı bu adla eklediğinizde otomatik görünür.

| Dosya | Nerede görünür |
|-------|----------------|
| `proj-1.jpg` | Hero kaydırmalı (carousel) + Projeler (geniş) — Eczane |
| `proj-2.jpg` | Hero + Projeler — Özkaymak Falez Hotel |
| `proj-3.jpg` | Hero + Projeler — Paninaro Social Club |
| `proj-4.jpg` | Hero + Projeler — Modern Villa |
| `proj-5.jpg` | Hero + Projeler — Diyetisyen Ofisi |
| `proj-6.jpg` | Projeler (geniş) — B Event Hall |
| `proj-7.jpg` | Projeler — Yatak Odası |
| `proj-8.jpg` | Projeler — Sedir |
| `gizem.jpg` | Hakkımızda — Gizem Uçak portresi |

## Nasıl eklerim?
GitHub'da `g13/img/` klasörü → **Add file → Upload files** → render'ları yukarıdaki adlarla yükleyip **Commit changes**.

## İpuçları
- Format: JPG/WebP. Hero için **yatay (geniş)** görseller idealdir (~1600px).
- Dosya boyutu < 350 KB (hız için). Büyükse [squoosh.app](https://squoosh.app).
- Proje adlarını/etiketlerini değiştirmek için `index.html` içindeki `data-cap`, `slide-cap` ve `.cap` metinlerini düzenleyin.
