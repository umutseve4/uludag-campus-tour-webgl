<h1 align="center">Bursa Uludağ Üniversitesi · Kampüs Turu</h1>

<p align="center">
  Görükle Yerleşkesi'nde <b>yürüyerek</b> gezdiğiniz, tek dosyalık bir 3B deneyim.<br>
  Kampüs kapısından başlarsınız; yol, fakülte, kütüphane ve ufuktaki Uludağ<br>
  daha ilk karede aynı kompozisyondadır.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/yerel%20ba%C4%9F%C4%B1ml%C4%B1l%C4%B1k-0-FF4D4F?style=flat-square" alt="Sıfır yerel bağımlılık">
  <img src="https://img.shields.io/badge/a%C4%9Fa%C3%A7-~700%20%C2%B7%204%20draw%20call-FF4D4F?style=flat-square" alt="700 ağaç, 4 draw call">
  <img src="https://img.shields.io/badge/duvar%20ko%C5%9Fusu-30%20dik%20%2B%2060%20%C3%A7apraz-FF4D4F?style=flat-square" alt="90 duvar koşusu">
</p>

**Build by Opus 5.**

---

## Nasıl gezilir

| Girdi | Etki |
|---|---|
| `W` `A` `S` `D` veya `↑` `↓` `←` `→` | Yürü (ivmeli, sürtünmeli hareket) |
| Fare / parmak **sürükleme** | Etrafına bak (yaw + pitch, pitch −1,05…0,95 rad kilitli) |
| `Shift` | Koş (7,2 m/s → 14 m/s tavan hız) |
| `R` | Başlangıç noktasına dön |
| `O` veya **Yörünge kamerası** düğmesi | Kampüsü dışarıdan izleyen OrbitControls moduna geç |

Sağ üstteki panel pusula yönünü ve bulunduğunuz bölgeyi (Kampüs Kapısı → Ring Durağı → Fakülte
Binası → Merkez Kütüphane → Çam Korusu → Uludağ Manzarası) gösterir.

## Çalıştırma

```bash
python -m http.server 8000   # sonra http://localhost:8000
```

`index.html`'i doğrudan açmak da çalışır. (Tek dosya, tek *yerel* dosya demek:
three.js çalışma anında CDN'den iner, yani çevrimdışı açılmaz.)

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

```bash
node tests/qa.mjs        # → QA RESULT: PASS (0 failures)
node tests/browser.mjs   # → BROWSER RESULT: PASS (0 failures)  (Playwright gerektirir)
```

**1) Statik harness** — `tests/qa.mjs`, bağımlılıksız: **57 kontrolün tamamı geçer.**
`index.html`'in **gerçek kaynak metninden** sabitleri, `BLOCKERS` dizisini ve `blocked()`
fonksiyonunu ayıklayıp Node'da koşturur.

<details>
<summary>57 kontrolün dökümü</summary>

- modül script'i geçerli ES modülü olarak ayrıştırılıyor;
- tek dosya sözleşmesi (yalnızca 2 `<script>` etiketi, harici `src` yok, Three.js sürümü sabitlenmiş);
- görünür `Build by Opus 5.` künyesi, tam MIT lisans metni ve başlık/yönerge katmanı yerinde;
- yönerge katmanı, koda bağlanmış **her tuşu** listeliyor (11 tuş etiketi);
- açılış kompozisyonu korunuyor: `START.yaw = 0`, yani ziyaretçi kampüse bakarak doğuyor;
- test sondası `window.__campus` donmuş ve yalnız getter — testler sahneyi süremez;
- 8 klavye kodunun tamamı ve sürükle-bak pointer olayları bağlı;
- çarpışma payı varsayılmıyor, `blocked()`'ın kendisinden ikili aramayla **ölçülüyor** (0,9 m);
- **temas atfı ile çarpışma aynı geometriyi görüyor:** hangi duvara çarpıldığı, payı yeniden yazan
  bir kopyayla değil, ürünün `blocked()` metninin tek engelle yeniden bağlanmasıyla belirlenir;
  200.000 rastgele nokta ve 48 sınır noktasında iki fonksiyonun kararı birebir aynı çıkıyor.
  (Bu kontrol boşuna değil: ölçülen pay `0.9000000000000021`, kaynaktaki `0.9` literalinden kılpayı
  büyüktü ve sınırın tam üstündeki bir temas komşu binaya yazılıyordu.)
- **bu yeniden bağlama yapısal olarak da doğrulanıyor:** `blocked()` metninde `BLOCKERS` dışında
  serbest ad yok ve dönüştürülmüş metin, adı geri çevrildiğinde orijinaline **birebir eşit** —
  yani test, ürünün mantığını yeniden türetmiyor, aynen yeniden bağlıyor;
- **çarpışma kapsaması:** 8 yapı ayak izinin her biri 625 örnek noktada kapalı (0 açık nokta);
- **yol koridoru** 2000 örnekte hiç kapalı değil — otobüs ve yürüyüş hattı hiç tıkanmıyor;
- **25 ayrı rastgele 100 saniyelik yürüyüş** hiçbir binanın içinde bitmiyor; gözlenen en büyük kare
  adımı **0,188 m**, `dt` kelepçesindeki teorik tavan ise **0,700 m** — ikisi de 0,9 m'lik çarpışma
  payının altında;
- **duvar testi konfigürasyon uzayında ve ÖRNEKLEMESİZ yapılır.** Serbest uzay, engellerin kendi
  kenarlarından üretilen **kesin hücre ayrıştırmasıyla** (17×15 hücre, tamamı ya bütünüyle dolu ya
  bütünüyle boş) kurulur; bu ayrıştırma ızgara çözünürlüğünden bağımsızdır. Başlangıç noktasının
  bileşeni serbest alanın **tamamını** (117.557 m²) kapsar, üstelik 4- ve 8-komşuluk aynı hücre
  kümesini verir — yani hiçbir sınıflandırma köşeden geçen kıl payı bir bağlantıya dayanmaz.
  8 engel kutusunun 32 duvar yüzeyi için, diğer gövdelerin **kapalı aralıklarının birleşimi**
  analitik olarak çıkarılır; örtülmeyen her açık aralık serbest ve bağlantılı bir doğru parçası
  olduğundan tek temsilci noktası aralığın **tamamının** bileşenini belirler. Döküm
  **sabitlenmiştir**: **30 koşulan + 2 tümüyle örtülü + 0 başlangıçtan kopuk = 32**. Koşulan her
  yüzde üç şey ayrı ayrı kanıtlanır: reddedilen aday adımın **hedef gövdenin içine girdiği** (yani
  yüzü gerçekten çaprazladığı — duvara varıp durmak sayılmaz), durduran engelin **hedeflenen engel**
  olduğu, ve koşu bittiğinde konumun serbest kaldığı. Koşu koridoru da analitik: 30 yüzün 29'unda
  45 m, birinde 1,20 m (orada duvara tam hızla yapışılır). Her yüz için iki **çapraz** (±0,5 rad)
  yaklaşım daha koşulur: 30 dik + 60 çapraz koşunun hiçbiri duvarı delip geçmiyor.
  (Bu tuzakların hepsi gerçekten yaşandı: önce başlangıç noktası komşu binanın içine düştü, sonra
  "başka duvara çarpıp bedava geçen koşu" riski çıktı, sonra CI 13 yüzeyin normal doğrultuda hiç
  koridoru olmadığını gösterdi, sonra bağımsız denetim "koridor yok, atla" kaçamağının kanıt değil
  varsayım olduğunu söyledi, sonra CI temas atfının kılpayı geniş bir payla yapıldığını ortaya
  çıkardı, en sonunda denetim 41 noktalık örneklemenin "kesin geometrik sınıflandırma" diye
  sunulamayacağını söyledi. Altısı da kalıcı kontrole dönüştürüldü.)
- ring otobüsü [−230,0 · +116,0] m aralığında kalıyor ve iki yönde de gerçekten gidip geliyor;
- HUD yer adları 8 farklı z konumunda doğru çözümleniyor;
- README'nin **sayısal iddiaları** (dosya boyutu, kontrol sayısı) dosyanın kendisiyle karşılaştırılıyor.

</details>

**2) Gerçek tarayıcı kabulü — `tests/browser.mjs`, Chromium + WebGL.**
CI, Playwright'ı depo ağacının dışına kurar, sayfayı yerel sunucudan açar ve gerçek kullanıcı
hareketlerini yapar: yükleme (0 konsol hatası, 0 başarısız istek), canlı WebGL bağlamı, loader'ın
kalkması, render döngüsünün ilerlemesi, katmanların sahnenin ortasını kapatmaması, `W` ile yürüyüp
bölge etiketinin değişmesi, sürükleyip pusulanın dönmesi, `R` ile başa dönüş ve HUD etiketinin
**kaç kare içinde** yetiştiği, `O`/düğme ile yörünge modu, sondanın yazılamazlığı, dar ekranda
etkileşimin sürmesi ve yeniden boyutlandırma. CI koşucusunda GPU yoktur (SwiftShader), bu yüzden
testler kare hızına değil **ilerlemeye** bakar. Kanıt olarak `artifacts/campus.png` ekran görüntüsü
CI çıktısına yüklenir.

## Kanıtın sınırları

Abartmamak için, testlerin **kapsamadığı** şeyler:

- **Akıcılık:** CI'da GPU yok; ölçülen kare hızı yazılım rasterizasyonunun hızıdır, gerçek
  donanımdaki deneyimin ölçüsü değildir.
- **Tarayıcı çeşitliliği:** yalnız Linux/Chromium + SwiftShader doğrulanır; Firefox, Safari/WebKit
  ve mobil GPU'lar kapsam dışıdır.
- **Neyin kesin, neyin ampirik olduğu:** yüz örtüsü ve serbest uzay bağlantılılığı artık
  **kesindir** — analitik aralık birleşimi ve AABB kenarlarından türetilmiş hücre ayrıştırması,
  çözünürlükten bağımsızdır. Buna karşılık ayak izi ızgaraları, rastgele yürüyüşler ve duvar
  koşularının kendisi hâlâ **ampirik** kanıttır: sürekli uzayda hiçbir yörüngenin tünelleyemeyeceği
  matematiksel olarak ispatlanmış değildir. Kare adımının çarpışma payından küçük kaldığı
  ölçülüyor, ispatlanmıyor.
- **Mimari doğruluk:** sahne Görükle Yerleşkesi'nden esinlenir; ölçülü/haritalı bir röprodüksiyon
  değildir ve hiçbir test binaları gerçek konumlarıyla karşılaştırmaz.
- **Görsel kalite:** ekran görüntüsü kanıt olarak yüklenir, ancak bir referans görüntüyle
  karşılaştırılmaz; kompozisyon bozulması insan gözü ister.

---

MIT — `LICENSE`. Kod tümüyle prosedüreldir; üçüncü taraf model, doku veya ses dosyası içermez.
Sahne, Görükle Yerleşkesi'nden **esinlenen** stilize bir yorumdur; ölçekli bir mimari reprodüksiyon değildir.
