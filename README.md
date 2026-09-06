# Bursa Uludağ Üniversitesi Kampüs Turu

Görükle Yerleşkesi'nde geçen, **tek dosyalık** bir 3B yürüyüş deneyimi. Tarayıcıda `index.html`'i
açmak yeterli — build adımı, paket kurulumu, indirilecek model/doku dosyası yok. (Tek dosya, tek
*yerel* dosya demek: three.js çalışma anında CDN'den iner, yani çevrimdışı açılmaz.)

**Build by Opus 5.**

---

## Ne var sahnede

| Öğe | Nasıl üretiliyor |
|---|---|
| Geniş kampüs yolu | 15 m asfalt + bordür + iki yanda kaldırım, 120 örnekli (instanced) şerit çizgisi |
| Çam koruları | Gövde + 3 katmanlı taç, tamamı `InstancedMesh`; ~700 ağaç, 4 draw call |
| Uludağ'ın karlı zirvesi | 130×130 segmentli arazi, 5 oktavlı deterministik fBm; yüksekliğe göre kaya→kar vertex renklendirmesi |
| Modern fakülte binası | Yatay cam bantlı ana blok, yan kanat, tuğla çekirdek kule, kolonlu giriş saçağı, bayrak direği |
| Merkez kütüphane | Podyum, dikey cam yarıklar, cam atriyum girişi, kavisli metal çatı, önünde havuz |
| Sokak lambaları | Yolun iki yanında şaşırtmalı, 26 m aralıklı; emissive lamba başlığı |
| Ahşap banklar | Metal ayak + ahşap oturma/sırt latası; 34 m aralıklı, çöp kutularıyla |
| Ring otobüsü | Yol boyunca −230 ↔ +116 m arası gidip gelir, tekerlekleri hıza bağlı döner, dönüşte şerit değiştirir |
| Ek doku | Kampüs kapısı, iki ring durağı, amfi terası, çalılar, çiçek tarhları, uçan kuşlar |

Aydınlatma: yönlü güneş (gölge haritası **kameranın etrafına taşınır**, böylece 3 km'lik sahnede
gölge çözünürlüğü israf edilmez) + hemisphere + hafif ambient, ACES filmic tone mapping,
mesafe sisi ve gradyan gökyüzü shader'ı.

Deneyim, kampüs kapısında **yola bakarak** başlar: yol, fakülte, kütüphane ve ufuktaki Uludağ
ilk karede aynı kompozisyondadır.

## Kontroller

| Girdi | Etki |
|---|---|
| `W` `A` `S` `D` veya `↑` `↓` `←` `→` | Yürü (ivmeli, sürtünmeli hareket) |
| Fare / parmak **sürükleme** | Etrafına bak (yaw + pitch, pitch −1,05…0,95 rad kilitli) |
| `Shift` | Koş (7,2 m/s → 14 m/s tavan hız) |
| `R` | Başlangıç noktasına dön |
| `O` veya **Yörünge kamerası** düğmesi | Kampüsü dışarıdan izleyen OrbitControls moduna geç |

Sağ üstteki panel pusula yönünü ve bulunduğunuz bölgeyi (Kampüs Kapısı → Ring Durağı → Fakülte
Binası → Merkez Kütüphane → Çam Korusu → Uludağ Manzarası) gösterir.

## Teknik

- Three.js **0.169.0**, `importmap` üzerinden CDN'den; `OrbitControls` aynı sürümün `examples/jsm` yolundan.
- Tek dosya `index.html` (41.347 bayt), sıfır yerel bağımlılık, sıfır build adımı, `node_modules` yok.
- Performans: instancing (ağaçlar, çalılar, çiçekler, şerit çizgileri), paylaşılan materyal havuzu,
  `devicePixelRatio` 2 ile sınırlı, sekme arkaplana alındığında render durur.
- Erişilebilirlik/dayanıklılık: `prefers-reduced-motion` açıksa sahne hareketsiz yörünge moduna düşer,
  canvas odaklanabilir ve `aria-label`'lıdır, `webglcontextlost` yakalanır, WebGL yoksa açıklayıcı ekran gösterilir.
- Çarpışma **yalnızca** yapılar içindir: fakülte blokları, kütüphane gövdesi/atriyumu/havuzu ve kapı
  ayakları katıdır. Ağaçlar, banklar, lambalar ve ring otobüsü bilinçli olarak geçirgendir; yürüyüş
  koridoru `x ∈ [−150, 150]`, `z ∈ [−260, 150]` ile sınırlanır.

## Doğrulama

İki bağımsız katman var ve ikisi de her push'ta `.github/workflows/qa.yml` ile çalışır.

**1) Statik harness** — `tests/qa.mjs`, bağımlılıksız: **54 kontrolün tamamı geçer.**
`index.html`'in **gerçek kaynak metninden** sabitleri, `BLOCKERS` dizisini ve `blocked()`
fonksiyonunu ayıklayıp Node'da koşturur:

- modül script'i geçerli ES modülü olarak ayrıştırılıyor;
- tek dosya sözleşmesi (yalnızca 2 `<script>` etiketi, harici `src` yok, Three.js sürümü sabitlenmiş);
- görünür `Build by Opus 5.` künyesi, tam MIT lisans metni ve başlık/yönerge katmanı yerinde;
- yönerge katmanı, koda bağlanmış **her tuşu** listeliyor (11 tuş etiketi);
- açılış kompozisyonu korunuyor: `START.yaw = 0`, yani ziyaretçi kampüse bakarak doğuyor;
- test sondası `window.__campus` donmuş ve yalnız getter — testler sahneyi süremez;
- 8 klavye kodunun tamamı ve sürükle-bak pointer olayları bağlı;
- çarpışma payı varsayılmıyor, `blocked()`'ın kendisinden ikili aramayla **ölçülüyor** (0,9 m);
- **çarpışma kapsaması:** 8 yapı ayak izinin her biri 625 örnek noktada kapalı (0 açık nokta);
- **yol koridoru** 2000 örnekte hiç kapalı değil — otobüs ve yürüyüş hattı hiç tıkanmıyor;
- **25 ayrı rastgele 100 saniyelik yürüyüş** hiçbir binanın içinde bitmiyor; gözlenen en büyük kare
  adımı **0,188 m**, `dt` kelepçesindeki teorik tavan ise **0,700 m** — ikisi de 0,9 m'lik çarpışma
  payının altında;
- **duvar testi konfigürasyon uzayında yapılır, kaçamak bırakmadan.** Başlangıç noktasından
  0,5 m'lik ızgarada flood-fill ile gerçekten yürünebilir bileşen çıkarılır. 8 engel kutusunun
  32 duvar yüzeyinin her birinin dış ε katmanı 41 noktada örneklenir; **açık ve başlangıca bağlı
  tek bir nokta bulunan her yüz mutlaka koşulur** (koşu koridoru 5 m'den kısaysa duvara tam hızla
  yapışarak). Her yüz tam olarak üç sınıftan birine düşer — *koşuldu* / *geometrik olarak tümüyle
  kapalı* / *başlangıçtan kopuk* — ve toplamları 32'ye kapanır; sınıflandırılamayan yüz kalırsa CI
  kırmızıya döner. Koşulan her yüzde durduran engelin **hedeflenen engel** olduğu ayrıca doğrulanır,
  ve her yüz için iki **çapraz** (±0,5 rad) yaklaşım daha koşulur. Hiçbir koşu duvarı delip geçmiyor.
  (Bu tuzakların hepsi gerçekten yaşandı: önce başlangıç noktası komşu binanın içine düştü, sonra
  "başka duvara çarpıp bedava geçen koşu" riski çıktı, sonra CI 13 yüzeyin normal doğrultuda hiç
  koridoru olmadığını gösterdi, en sonunda bağımsız denetim "koridor yok, atla" kaçamağının kanıt
  değil varsayım olduğunu söyledi. Dördü de kalıcı kontrole dönüştürüldü.)
- ring otobüsü [−230,0 · +116,0] m aralığında kalıyor ve iki yönde de gerçekten gidip geliyor;
- HUD yer adları 8 farklı z konumunda doğru çözümleniyor;
- README'nin **sayısal iddiaları** (dosya boyutu, kontrol sayısı) dosyanın kendisiyle karşılaştırılıyor.

**2) Gerçek tarayıcı kabulü — `tests/browser.mjs`, Chromium + WebGL.**
CI, Playwright'ı depo ağacının dışına kurar, sayfayı yerel sunucudan açar ve gerçek kullanıcı
hareketlerini yapar: yükleme (0 konsol hatası, 0 başarısız istek), canlı WebGL bağlamı, loader'ın
kalkması, render döngüsünün ilerlemesi, katmanların sahnenin ortasını kapatmaması, `W` ile yürüyüp
bölge etiketinin değişmesi, sürükleyip pusulanın dönmesi, `R` ile başa dönüş ve HUD etiketinin
**kaç kare içinde** yetiştiği, `O`/düğme ile yörünge modu, sondanın yazılamazlığı, dar ekranda
etkileşimin sürmesi ve yeniden boyutlandırma. CI koşucusunda GPU yoktur (SwiftShader), bu yüzden
testler kare hızına değil **ilerlemeye** bakar. Kanıt olarak `artifacts/campus.png` ekran görüntüsü
CI çıktısına yüklenir.

```bash
node tests/qa.mjs        # → QA RESULT: PASS (0 failures)
node tests/browser.mjs   # → BROWSER RESULT: PASS (0 failures)  (Playwright gerektirir)
```

### Kanıtın sınırları

Abartmamak için, testlerin **kapsamadığı** şeyler:

- **Akıcılık:** CI'da GPU yok; ölçülen kare hızı yazılım rasterizasyonunun hızıdır, gerçek
  donanımdaki deneyimin ölçüsü değildir.
- **Tarayıcı çeşitliliği:** yalnız Linux/Chromium + SwiftShader doğrulanır; Firefox, Safari/WebKit
  ve mobil GPU'lar kapsam dışıdır.
- **Örnekleme ≠ ispat:** ayak izi ızgaraları, ε katmanı örneklemesi, 0,5 m'lik erişilebilirlik
  ızgarası ve rastgele yürüyüşler güçlü ampirik kanıttır; sürekli uzayda tünelleme olmadığının
  matematiksel ispatı değildir. Özellikle "kapalı" ve "kopuk" sınıfları ızgara/örnek çözünürlüğü
  kadar kesindir.
- **Mimari doğruluk:** sahne Görükle Yerleşkesi'nden esinlenir; ölçülü/haritalı bir röprodüksiyon
  değildir ve hiçbir test binaları gerçek konumlarıyla karşılaştırmaz.
- **Görsel kalite:** ekran görüntüsü kanıt olarak yüklenir, ancak bir referans görüntüyle
  karşılaştırılmaz; kompozisyon bozulması insan gözü ister.

## Lisans

MIT — `LICENSE`. Kod tümüyle prosedüreldir; üçüncü taraf model, doku veya ses dosyası içermez.
Sahne, Görükle Yerleşkesi'nden **esinlenen** stilize bir yorumdur; ölçekli bir mimari reprodüksiyon değildir.
