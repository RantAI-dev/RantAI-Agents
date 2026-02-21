# Pola Fraud Asuransi — Panduan Deteksi

## 1. Pola Fraud Asuransi Kesehatan

### HF-01: Phantom Billing (Tagihan Fiktif)

**Deskripsi:** Tagihan untuk layanan medis yang tidak pernah diberikan kepada peserta.

**Indikator:**
- Tagihan prosedur yang tidak sesuai dengan diagnosis
- Jumlah sesi terapi lebih banyak dari yang secara fisik memungkinkan
- Klaim dari provider saat peserta bisa dibuktikan berada di lokasi lain
- Volume klaim provider jauh di atas rata-rata untuk tipe yang sama
- Tidak ada catatan rekam medis yang sesuai

**Contoh Kasus:**
> Peserta mengklaim 10 sesi fisioterapi di Klinik Sehat Jaya dalam 1 bulan, namun hanya hadir 2 kali. Klinik menagih penuh 10 sesi dengan total Rp 5.000.000.

**Skor Penalti:** +30 (MEDIUM) hingga +50 (HIGH jika terbukti)

---

### HF-02: Upcoding (Penggelembungan Kode)

**Deskripsi:** Provider menagih menggunakan kode prosedur yang lebih mahal dari yang sebenarnya dilakukan.

**Indikator:**
- Biaya yang tidak proporsional dengan diagnosis
- Kode prosedur untuk operasi besar tapi masa rawat hanya 1 hari
- Perbedaan signifikan antara diagnosa dan prosedur
- Provider memiliki rasio prosedur mahal yang tinggi dibanding peer

**Contoh Kasus:**
> Pasien datang untuk konsultasi flu biasa (J06.9), tapi provider menagih sebagai rawat jalan komprehensif dengan lab lengkap, total Rp 3.500.000 untuk yang seharusnya hanya Rp 500.000.

**Skor Penalti:** +20 (MEDIUM)

---

### HF-03: Unbundling (Pemecahan Tagihan)

**Deskripsi:** Memecah satu paket layanan menjadi komponen terpisah agar total tagihan lebih besar.

**Indikator:**
- Beberapa klaim terpisah pada tanggal yang sama untuk satu kunjungan
- Prosedur yang biasanya satu paket ditagih terpisah
- Lab panel dipecah menjadi tes individual
- Total biaya terpisah melebihi harga paket normal

**Contoh Kasus:**
> Pemeriksaan darah lengkap (panel hematologi) yang seharusnya satu paket Rp 450.000 dipecah menjadi 8 tes terpisah dengan total Rp 1.200.000.

**Skor Penalti:** +15 (MEDIUM)

---

### HF-04: Double Billing (Klaim Duplikat)

**Deskripsi:** Mengajukan klaim yang sama lebih dari sekali, baik ke satu atau beberapa perusahaan asuransi.

**Indikator:**
- Klaim dengan tanggal layanan, provider, dan diagnosis yang identik
- Nomor kuitansi yang sama atau berurutan pada hari yang sama
- Peserta memiliki lebih dari satu polis aktif tanpa COB declaration
- Total klaim melebihi biaya aktual yang dikeluarkan

**Contoh Kasus:**
> Peserta mengajukan klaim rawat inap demam berdarah Rp 12.000.000 ke polis HorizonLife dan sekaligus ke asuransi kantor, tanpa mendeklarasikan koordinasi manfaat.

**Skor Penalti:** +40 (HIGH)

---

### HF-05: Identity Fraud (Penyalahgunaan Identitas)

**Deskripsi:** Menggunakan kartu atau polis asuransi milik orang lain untuk mendapatkan layanan medis.

**Indikator:**
- Demografi pasien tidak sesuai data peserta (usia, gender)
- Tanda tangan berbeda dari yang ada di file
- Provider melaporkan pasien berbeda dari yang ada di kartu
- Klaim simultan di lokasi yang berjauhan

**Contoh Kasus:**
> Anak (22 tahun) menggunakan kartu asuransi ayahnya (55 tahun) untuk rawat inap. RS tidak melakukan verifikasi foto.

**Skor Penalti:** +50 (HIGH)

---

### HF-06: Provider Collusion (Kolusi Provider)

**Deskripsi:** Kerja sama antara provider dan peserta/pihak lain untuk mengajukan klaim palsu atau digelembungkan.

**Indikator:**
- Provider memiliki rasio klaim yang jauh lebih tinggi dari rata-rata
- Pola klaim yang seragam dari satu provider (diagnosa sama, nominal mirip)
- Provider merekomendasikan prosedur yang tidak diperlukan
- Peserta secara konsisten menggunakan provider yang sama untuk semua klaim
- Provider baru dengan volume klaim tinggi dalam bulan-bulan pertama

**Contoh Kasus:**
> Klinik Sehat Jaya memiliki 45 klaim fisioterapi dalam 1 bulan, jauh di atas rata-rata klinik sejenis (8-12 klaim/bulan). 60% klaim berasal dari 5 peserta yang sama.

**Skor Penalti:** +40 (HIGH)

---

### HF-07: Excessive Visits (Kunjungan Berlebihan)

**Deskripsi:** Frekuensi kunjungan medis yang tidak wajar untuk kondisi yang diklaim.

**Indikator:**
- Lebih dari 5 klaim dalam 30 hari (flag MEDIUM)
- Lebih dari 10 klaim dalam 30 hari (flag HIGH)
- Kunjungan ke multiple provider dalam periode singkat untuk diagnosa sama
- Frekuensi meningkat drastis dibanding bulan-bulan sebelumnya
- Fisioterapi lebih dari 3x seminggu tanpa indikasi medis jelas

**Benchmark Frekuensi Normal:**
| Diagnosa | Frekuensi Wajar | Threshold Mencurigakan |
|----------|----------------|----------------------|
| Flu/ISPA (J06.9) | 1-2x/tahun | >4x/tahun |
| Nyeri punggung (M54.5) | 1-2x/bulan (fase akut) | >4x/bulan |
| Fisioterapi | 2-3x/minggu (maks 12 sesi) | >3x/minggu atau >20 sesi |
| Gastritis (K29.7) | 1x/bulan | >3x/bulan |
| Rawat inap | 1-2x/tahun | >3x/tahun |

**Skor Penalti:** +15 (MEDIUM >5x/bulan) hingga +35 (HIGH >10x/bulan)

---

### HF-08: Fake Receipts (Kuitansi Palsu)

**Deskripsi:** Menggunakan kuitansi palsu, dimanipulasi, atau diedit untuk mengajukan klaim.

**Indikator:**
- Nominal pada kuitansi terlihat diedit (digital atau fisik)
- Font/format tidak konsisten dalam satu dokumen
- Nomor kuitansi tidak berurutan atau format tidak sesuai standar provider
- Stempel/cap terlihat buram atau tidak jelas
- Tanggal pada kuitansi tidak cocok dengan jadwal operasional provider

**Contoh Kasus:**
> Kuitansi apotek diubah dari Rp 150.000 menjadi Rp 1.500.000 dengan menambahkan angka "0" secara digital.

**Skor Penalti:** +30 (HIGH)

---

### HF-09: Unnecessary Procedures (Prosedur Tidak Perlu)

**Deskripsi:** Provider melakukan atau menagihkan prosedur medis yang secara klinis tidak diperlukan.

**Indikator:**
- MRI untuk diagnosis yang biasanya cukup X-ray
- Operasi tanpa riwayat treatment konservatif terlebih dahulu
- Lab lengkap untuk keluhan ringan (flu, batuk)
- Rujukan spesialis tanpa indikasi medis
- Prosedur diagnostik berulang dalam waktu singkat

**Contoh Kasus:**
> Peserta mengeluh nyeri punggung ringan, langsung dilakukan MRI (Rp 5.000.000) dan dirujuk operasi tanpa mencoba fisioterapi atau obat anti-nyeri terlebih dahulu.

**Skor Penalti:** +20 (MEDIUM)

---

### HF-10: Age/Gender Mismatch (Ketidaksesuaian Demografi)

**Deskripsi:** Prosedur atau diagnosis yang tidak sesuai dengan usia atau jenis kelamin peserta.

**Indikator:**
- Diagnosis obstetri/ginekologi (O80, O82, N83, C56) pada pasien laki-laki
- Diagnosis prostat (N40, C61, N41) pada pasien perempuan
- Prosedur pediatrik pada pasien dewasa
- Diagnosis geriatri pada pasien muda (<30 tahun)

**Kode Khusus Gender:**
| Gender | Kode ICD-10 | Deskripsi |
|--------|-------------|-----------|
| Perempuan saja | O80, O82 | Persalinan |
| Perempuan saja | N83, C56 | Ovarium |
| Perempuan saja | C50 (mayoritas) | Kanker payudara |
| Laki-laki saja | N40, N41 | Prostat |
| Laki-laki saja | C61 | Kanker prostat |

**Skor Penalti:** +50 (HIGH — strong indicator of identity fraud)

---

## 2. Pola Fraud Asuransi Jiwa

### LF-01: Staged Death (Kematian Palsu)

**Deskripsi:** Memalsukan kematian untuk mengklaim uang pertanggungan.

**Indikator:**
- Akta kematian dari daerah terpencil tanpa RS terdekat
- Tidak ada autopsi meskipun kematian mendadak
- Jenazah dikremasi cepat sebelum verifikasi
- Saksi kematian adalah keluarga atau kenalan dekat saja
- Kematian terjadi di luar negeri tanpa bukti perjalanan

**Skor Penalti:** +50 (CRITICAL)

---

### LF-02: Pre-existing Condition (Kondisi Pre-Existing Tersembunyi)

**Deskripsi:** Menyembunyikan kondisi kesehatan yang sudah ada sebelum mendaftar asuransi.

**Indikator:**
- Klaim penyakit kronis dalam 12 bulan pertama polis
- Riwayat medis menunjukkan diagnosis sebelum tanggal polis
- Obat-obatan rutin yang sudah dikonsumsi sebelum polis aktif
- Kematian akibat penyakit yang biasanya berkembang lama, tapi polis baru

**Skor Penalti:** +30 (MEDIUM) hingga +50 (HIGH jika dalam contestability period)

---

### LF-03: Application Fraud (Pemalsuan Aplikasi)

**Deskripsi:** Memalsukan data pada formulir pendaftaran asuransi (usia, pekerjaan, riwayat medis).

**Indikator:**
- Usia pada aplikasi tidak sesuai KTP
- Pekerjaan berisiko tinggi (penambang, penyelam) dilaporkan sebagai pekerjaan kantoran
- Hobi berisiko tidak dideklarasikan
- Riwayat merokok disembunyikan
- Riwayat rawat inap tidak dilaporkan

**Skor Penalti:** +40 (HIGH)

---

### LF-04: Beneficiary Fraud (Manipulasi Penerima Manfaat)

**Deskripsi:** Manipulasi data penerima manfaat untuk keuntungan pihak tertentu.

**Indikator:**
- Perubahan beneficiary dalam 6 bulan terakhir sebelum kematian
- Beneficiary bukan keluarga dekat tanpa alasan jelas
- Beneficiary memiliki hubungan bisnis atau utang dengan tertanggung
- Multiple perubahan beneficiary dalam waktu singkat

**Skor Penalti:** +35 (HIGH)

---

### LF-05: Churning (Pergantian Polis Berulang)

**Deskripsi:** Agen asuransi menjual polis baru berulang kali untuk mendapatkan komisi baru.

**Indikator:**
- Polis dibatalkan dan diganti dalam 6-12 bulan
- Agen yang sama menjual polis pengganti
- Uang pertanggungan naik drastis tanpa perubahan kebutuhan
- Premi meningkat tanpa peningkatan coverage yang signifikan

**Skor Penalti:** +20 (MEDIUM — biasanya masalah internal)

---

### LF-06: Murder for Profit (Pembunuhan untuk Keuntungan)

**Deskripsi:** Pembunuhan yang dimotivasi oleh klaim asuransi jiwa.

**Indikator:**
- Polis bernilai sangat besar (>Rp 2 miliar) pada individu dengan penghasilan tidak sesuai
- Polis baru (< 24 bulan) + kematian mendadak
- Kematian tidak wajar (kecelakaan tunggal, keracunan)
- Beneficiary terlibat langsung dalam insiden kematian
- Tertanggung memiliki utang besar kepada beneficiary

**Skor Penalti:** +50 (CRITICAL — otomatis eskalasi ke SIU + kepolisian)

---

### LF-07: Suicide Misrepresentation (Penyamaran Bunuh Diri)

**Deskripsi:** Menyamarkan bunuh diri sebagai kecelakaan atau kematian alami untuk mendapatkan klaim.

**Indikator:**
- Kecelakaan tunggal tanpa saksi
- Riwayat gangguan mental atau depresi
- Peningkatan polis/rider accidental death sebelum kejadian
- Tanda-tanda self-harm pada autopsi
- Catatan atau pesan terakhir yang mencurigakan

**Skor Penalti:** +40 (HIGH — dalam 2 tahun pertama = exclusion)

---

## 3. Matriks Severity dan Tindakan

| Severity | Skor | Tindakan |
|----------|------|----------|
| LOW | 0-15 | Log saja, tidak perlu tindakan |
| MEDIUM | 16-35 | Masuk antrian review analyst |
| HIGH | 36-50 | Eskalasi ke senior analyst, klaim di-hold |
| CRITICAL | >50 | Freeze klaim + eskalasi ke SIU + lapor manajemen |

## 4. Kombinasi Pola (Risk Multiplier)

Jika ditemukan lebih dari satu pola pada klaim yang sama:
- 2 pola MEDIUM = upgrade ke HIGH
- 1 HIGH + 1 MEDIUM = upgrade ke CRITICAL
- 2+ HIGH = otomatis CRITICAL + SIU referral
- Pola yang melibatkan provider watchlist = skor +20 tambahan
