# Backend Dokümantasyonu — SIN Beauty Studio

Bu site **statik**tir (GitHub Pages) — geleneksel bir sunucu/veritabanı yoktur ve bir güzellik salonu için buna **gerek de yoktur**. Bu doküman, "backend" ihtiyacı doğuran tek şeyi — **randevu/iletişim formu** — nasıl ele aldığımızı ve ileride nasıl büyütebileceğinizi anlatır.

---

## 1. Mevcut Durum: Backend'siz Randevu (WhatsApp)

`#iletisim` bölümündeki **Hızlı Randevu formu**, sunucuya veri göndermez. Bunun yerine, kullanıcı "WhatsApp ile Gönder"e bastığında form alanlarından bir mesaj oluşturup WhatsApp'ı açar:

```js
var msg = 'Merhaba, SIN Beauty Studio\'dan randevu almak istiyorum.\n\n'
        + 'Ad: ' + ad + '\nHizmet: ' + hizmet + (not ? '\nNot: ' + not : '');
window.open('https://wa.me/905075119200?text=' + encodeURIComponent(msg), '_blank');
```

**Avantajları:** Sunucu yok, maliyet yok, bakım yok, spam yok, KVKK açısından basit (veri sizde toplanmaz). Küçük bir salon için **önerilen** yöntem budur.

**Sınırı:** Kayıtlar otomatik bir yerde tutulmaz (WhatsApp geçmişinde kalır).

---

## 2. Ne Zaman Gerçek Backend Gerekir?

Aşağıdakileri istiyorsanız hafif bir backend ekleyin:
- Randevuların **e-postaya** düşmesi,
- Randevuların bir **tabloda/CRM'de** birikmesi,
- **Takvim / saat seçimi** ve çakışma kontrolü,
- Otomatik **onay/hatırlatma** mesajları.

Statik siteyi korurken bunları eklemenin yolları (kolaydan gelişmişe):

---

## 3. Seçenek A — Formspree (en kolay, e-posta)

Kod yazmadan formu e-postaya bağlar.

1. [formspree.io](https://formspree.io) üzerinden ücretsiz form oluşturun → bir endpoint alırsınız.
2. `#iletisim` formunu şu şekilde değiştirin:
   ```html
   <form action="https://formspree.io/f/XXXXXXXX" method="POST" class="rform">
     <input name="ad" required>
     <select name="hizmet">…</select>
     <textarea name="not"></textarea>
     <button type="submit" class="btn btn-primary">Gönder</button>
   </form>
   ```
3. JS'teki `submit` engelini kaldırın (native gönderim çalışsın).

**Artı:** 5 dakikada kurulur. **Eksi:** Ücretsiz planda aylık gönderim limiti.

---

## 4. Seçenek B — Google Apps Script + Google Sheets (ücretsiz, tabloya kayıt)

Randevular otomatik bir Google E-Tablosuna düşer.

1. Bir Google E-Tablosu açın → **Uzantılar > Apps Script**.
2. Şu Web App'i yapıştırın ve dağıtın (Deploy > Web app > "Anyone"):
   ```js
   function doPost(e){
     var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
     var d = e.parameter;
     sheet.appendRow([new Date(), d.ad, d.hizmet, d.not]);
     return ContentService.createTextOutput(JSON.stringify({ok:true}))
              .setMimeType(ContentService.MimeType.JSON);
   }
   ```
3. Frontend'de `fetch` ile gönderin:
   ```js
   fetch('https://script.google.com/macros/s/XXXX/exec', {
     method:'POST',
     body:new URLSearchParams({ad:ad, hizmet:hizmet, not:not})
   });
   ```

**Artı:** Ücretsiz, kayıtlar tabloda birikir. **Eksi:** Kurulum biraz teknik.

---

## 5. Seçenek C — EmailJS (JS'ten doğrudan e-posta)

Sunucu yazmadan tarayıcıdan e-posta gönderir. [emailjs.com](https://www.emailjs.com) — service/template ID alıp `emailjs.send(...)` çağrısı yapılır. Herkese açık anahtar frontend'de durur; **oran sınırı ve domain kısıtı** açmayı unutmayın.

---

## 6. Seçenek D — Serverless Fonksiyon (en esnek)

Takvim, çakışma kontrolü, gizli anahtarlar gerekiyorsa:

- **Cloudflare Workers**, **Vercel Functions** veya **Netlify Functions** ile küçük bir `/api/randevu` endpoint'i yazın.
- Site yine statik kalır; sadece form `fetch('/api/randevu')` çağırır.
- Gizli anahtarlar (SMTP, WhatsApp Business API token'ı) **fonksiyonun ortam değişkenlerinde** durur — asla frontend'e koymayın.

> **Not:** GitHub Pages serverless fonksiyon çalıştıramaz. Bu seçenek için formu bir Worker/Vercel endpoint'ine yönlendirmeniz yeterlidir; sitenin geri kalanı GitHub Pages'te kalabilir.

---

## 7. Instagram Akışını Gömme (galeri için)

Galeriyi otomatik Instagram gönderileriyle doldurmak isterseniz:
- **Instagram Basic Display API** veya bir üçüncü parti widget (EmbedSocial, Elfsight, LightWidget).
- API kullanacaksanız access token'ı bir serverless fonksiyonda saklayıp önbelleğe alın; token'ı frontend'e gömmeyin.
- Basit çözüm: en iyi 6–9 gönderiyi manuel olarak `<img>` ile ekleyin (README'deki yönteme bakın).

---

## 8. Güvenlik & Gizlilik Notları

- **Gizli anahtar / token asla frontend'e (HTML/JS) yazılmaz** — sadece serverless ortam değişkenlerinde.
- Spam'e karşı: honeypot alanı, basit rate-limit veya hCaptcha ekleyin (form gerçek backend'e bağlanırsa).
- **KVKK:** Kişisel veri (ad, telefon) toplayan bir forma geçerseniz, kısa bir aydınlatma metni / onay kutusu ekleyin. WhatsApp yöntemi bu yükü ortadan kaldırır.

---

## 9. Öneri (Özet)

| Salon büyüklüğü | Önerilen |
|------------------|----------|
| Küçük / tek kişi | **Mevcut WhatsApp yöntemi** (hiçbir şey yapmayın) |
| E-posta isteniyor | **Formspree** |
| Kayıt tablosu isteniyor | **Google Apps Script + Sheets** |
| Takvim/otomasyon | **Serverless fonksiyon** |

Şu an sitede **A/B/C/D seçeneklerinden hiçbiri kurulu değildir** — form güvenli şekilde WhatsApp'a yönlendirir. İhtiyaç oldukça yukarıdaki adımlarla yükseltilebilir.
