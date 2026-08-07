# Fotoğraf Klasörü — buraya gerçek fotoğrafları koyun

Site, aşağıdaki dosya adlarını **otomatik** yükler. Dosyayı bu klasöre bu adlarla eklemeniz yeterli — kod değişikliği gerekmez. Dosya yoksa zarif bir gradient gösterilir (site asla bozuk görünmez).

| Dosya adı | Nerede görünür | Öneri |
|-----------|----------------|-------|
| `hero.jpg`  | Üst (hero) büyük görsel | En etkileyici tekil çalışma (dikey/kare) |
| `nail-1.jpg` | Galeri — büyük kare (turuncu & pembe swirl) | Dikey de olur |
| `nail-2.jpg` | Galeri (kırmızı & leopar) | Kare |
| `nail-3.jpg` | Galeri (pastel french) | Kare |
| `nail-4.jpg` | Galeri — büyük kare (altın yaprak) | Dikey de olur |
| `nail-5.jpg` | Galeri (kalıcı oje) | Kare |
| `nail-6.jpg` | Galeri (protez tırnak) | Kare |
| `salon.jpg`  | "Hakkımızda" görseli | Salon içi / ekip / detay |

## Nasıl eklerim?
**GitHub web üzerinden (en kolay):**
1. GitHub'da bu klasörü açın → **Add file → Upload files**.
2. Fotoğrafları yukarıdaki adlarla sürükleyip bırakın (gerekirse yeniden adlandırın).
3. **Commit changes**.

## İpuçları
- Format: **JPG** veya **WebP**. Genişlik ~1000–1400px yeterli.
- Dosya boyutu **< 250 KB** olsun (hız için). Büyükse [squoosh.app](https://squoosh.app) ile küçültün.
- İsim/etiketleri galeride değiştirmek isterseniz `index.html` içindeki `data-cap` değerlerini düzenleyin.
