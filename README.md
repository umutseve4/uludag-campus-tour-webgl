# Bursa Uludağ Üniversitesi Kampüs Turu

Görükle Yerleşkesi'nde geçen, **tek dosyalık** bir 3B yürüyüş deneyimi. Tarayıcıda `index.html`'i
açmak yeterli — build adımı, paket kurulumu, indirilecek model/doku dosyası yok.

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

## Kontroller

| Girdi | Etki |
|---|---|
| `W` `A` `S` `D` veya `↑` `↓` `←` `→` | Yürü (ivmeli, sürtünmeli hareket) |
| Fare / parmak **sürükleme** | Etrafına bak (yaw + pitch, pitch −1.05…0.95 rad kilitli) |
| `Shift` | Koş (7.2 m/s → 14 m/s) |
| `R` | Başlangıç noktasına dön |
| `O` veya **Yörünge kamerası** düğmesi | Kampüsü dışarıdan izleyen OrbitControls moduna geç |

Sağ üstteki panel pusula yönünü ve bulunduğunuz bölgeyi (Kampüs Kapısı → Ring Durağı → Fakülte
Binası → Merkez Kütüphane → Çam Korusu → Uludağ Manzarası) gösterir.

## Teknik

- Three.js **0.169.0**, `importmap` üzerinden CDN'den; `OrbitControls` aynı sürümün `examples/jsm` yolundan.
- Tek dosya `index.html` (40.815 bayt), sıfır bağımlılık, sıfır build adımı, `node_modules` yok.
- Performans: instancing (ağaçlar, çalılar, çiçekler, şerit çizgileri), paylaşılan materyal havuzu,
  `devicePixelRatio` 2 ile sınırlı, sekme arkaplana alındığında render durur.
- Erişilebilirlik/dayanıklılık: `prefers-reduced-motion` açıksa sahne hareketsiz yörünge moduna düşer,
  canvas odaklanabilir ve `aria-label`'lıdır, `webglcontextlost` yakalanır, WebGL yoksa açıklayıcı ekran gösterilir.

## Doğrulama

`tests/qa.mjs`, `index.html`'in **gerçek kaynak metninden** sabitleri ve `blocked()` fonksiyonunu
ayıklayıp Node'da koşturur; hiçbir bağımlılık gerektirmez. Her push'ta `.github/workflows/qa.yml`
ile çalışır ve **39 kontrolün tamamı geçer**:

- modül script'i geçerli ES modülü olarak ayrıştırılıyor;
- tek dosya sözleşmesi (yalnızca 2 `<script>` etiketi, harici `src` yok, Three.js sürümü sabitlenmiş);
- üstteki başlık ve alttaki yönerge katmanı metinleri yerinde;
- 8 klavye kodunun tamamı ve sürükle-bak pointer olayları bağlı;
- **çarpışma kapsaması:** 8 yapı ayak izinin her biri 625 örnek noktada tam kapalı (0 açık nokta);
- **yol koridoru** 2000 örnekte hiç kapalı değil — otobüs ve yürüyüş hattı hiç tıkanmıyor;
- **25 ayrı rastgele 100 saniyelik yürüyüş** hiçbir binanın içinde bitmiyor; kare başına en büyük
  adım **0,188 m** ve 0,9 m'lik çarpışma payının altında, yani duvardan geçiş (tunnelling) yapısal olarak mümkün değil;
- ring otobüsü [−230,0 · +116,0] m aralığında kalıyor ve iki yönde de gerçekten gidip geliyor;
- HUD yer adları 8 farklı z konumunda doğru çözümleniyor.

```bash
node tests/qa.mjs   # → QA RESULT: PASS (0 failures)
```

## Lisans

MIT — `LICENSE`. Kod tümüyle prosedüreldir; üçüncü taraf model, doku veya ses dosyası içermez.
Sahne, Görükle Yerleşkesi'nden **esinlenen** stilize bir yorumdur; ölçekli bir mimari röprodüksiyon değildir.
