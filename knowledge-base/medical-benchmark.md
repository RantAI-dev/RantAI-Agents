# Benchmark Biaya Medis Indonesia

## 1. Benchmark Biaya per Diagnosa per Kota

### 1.1 Rawat Jalan

| Diagnosa (ICD-10) | Jakarta | Surabaya | Bandung | Medan | Semarang |
|-------------------|---------|----------|---------|-------|----------|
| J06.9 — Flu / ISPA | Rp 300.000 - 600.000 | Rp 250.000 - 500.000 | Rp 200.000 - 450.000 | Rp 200.000 - 400.000 | Rp 200.000 - 400.000 |
| K29.7 — Gastritis | Rp 350.000 - 700.000 | Rp 300.000 - 600.000 | Rp 250.000 - 500.000 | Rp 250.000 - 500.000 | Rp 250.000 - 450.000 |
| M54.5 — Nyeri punggung | Rp 400.000 - 800.000 | Rp 350.000 - 700.000 | Rp 300.000 - 600.000 | Rp 300.000 - 600.000 | Rp 300.000 - 550.000 |
| A09 — Diare | Rp 250.000 - 500.000 | Rp 200.000 - 450.000 | Rp 200.000 - 400.000 | Rp 200.000 - 400.000 | Rp 180.000 - 350.000 |
| N39.0 — Infeksi saluran kemih | Rp 350.000 - 600.000 | Rp 300.000 - 550.000 | Rp 250.000 - 500.000 | Rp 250.000 - 450.000 | Rp 250.000 - 450.000 |
| L30 — Dermatitis | Rp 250.000 - 500.000 | Rp 200.000 - 400.000 | Rp 200.000 - 400.000 | Rp 200.000 - 350.000 | Rp 180.000 - 350.000 |

**Threshold Mencurigakan (Rawat Jalan):**
- Biaya > 150% dari batas atas rata-rata kota = FLAG MEDIUM
- Biaya > 200% dari batas atas rata-rata kota = FLAG HIGH

---

### 1.2 Rawat Inap

| Diagnosa (ICD-10) | Jakarta | Surabaya | Bandung | Medan |
|-------------------|---------|----------|---------|-------|
| J18.9 — Pneumonia (5-7 hari) | Rp 12.000.000 - 25.000.000 | Rp 10.000.000 - 20.000.000 | Rp 8.000.000 - 18.000.000 | Rp 8.000.000 - 16.000.000 |
| A97.0 — Demam berdarah (5-7 hari) | Rp 8.000.000 - 18.000.000 | Rp 7.000.000 - 15.000.000 | Rp 6.000.000 - 13.000.000 | Rp 6.000.000 - 12.000.000 |
| K35 — Appendicitis + operasi | Rp 20.000.000 - 45.000.000 | Rp 18.000.000 - 38.000.000 | Rp 15.000.000 - 35.000.000 | Rp 15.000.000 - 30.000.000 |
| S52.5 — Fraktur + ORIF | Rp 25.000.000 - 60.000.000 | Rp 20.000.000 - 50.000.000 | Rp 18.000.000 - 45.000.000 | Rp 18.000.000 - 40.000.000 |
| I21 — Infark miokard (PCI) | Rp 80.000.000 - 200.000.000 | Rp 70.000.000 - 170.000.000 | Rp 60.000.000 - 150.000.000 | Rp 55.000.000 - 140.000.000 |
| O82 — Sectio caesarea | Rp 25.000.000 - 55.000.000 | Rp 20.000.000 - 45.000.000 | Rp 18.000.000 - 40.000.000 | Rp 15.000.000 - 35.000.000 |
| O80 — Persalinan normal | Rp 10.000.000 - 25.000.000 | Rp 8.000.000 - 20.000.000 | Rp 7.000.000 - 18.000.000 | Rp 6.000.000 - 15.000.000 |

**Threshold Mencurigakan (Rawat Inap):**
- Biaya > 130% dari batas atas rata-rata kota = FLAG MEDIUM
- Biaya > 170% dari batas atas rata-rata kota = FLAG HIGH
- Lama rawat > 150% dari rata-rata untuk diagnosis = FLAG MEDIUM

---

### 1.3 Prosedur Diagnostik

| Prosedur | Jakarta | Surabaya | Bandung |
|----------|---------|----------|---------|
| MRI (per area) | Rp 3.000.000 - 6.000.000 | Rp 2.500.000 - 5.000.000 | Rp 2.500.000 - 4.500.000 |
| CT Scan (per area) | Rp 1.500.000 - 3.500.000 | Rp 1.200.000 - 3.000.000 | Rp 1.000.000 - 2.800.000 |
| X-Ray | Rp 200.000 - 500.000 | Rp 150.000 - 400.000 | Rp 150.000 - 350.000 |
| USG | Rp 300.000 - 800.000 | Rp 250.000 - 700.000 | Rp 250.000 - 600.000 |
| Lab darah lengkap | Rp 300.000 - 600.000 | Rp 250.000 - 500.000 | Rp 200.000 - 450.000 |
| Lab panel metabolik | Rp 400.000 - 900.000 | Rp 350.000 - 750.000 | Rp 300.000 - 700.000 |
| EKG | Rp 150.000 - 400.000 | Rp 150.000 - 350.000 | Rp 150.000 - 300.000 |
| Endoskopi | Rp 3.000.000 - 7.000.000 | Rp 2.500.000 - 6.000.000 | Rp 2.000.000 - 5.500.000 |

---

### 1.4 Fisioterapi

| Jenis | Biaya per Sesi | Frekuensi Normal | Threshold |
|-------|---------------|-----------------|-----------|
| Fisioterapi standar | Rp 200.000 - 500.000 | 2-3x/minggu | > Rp 600.000/sesi |
| Fisioterapi + alat (TENS, ultrasound) | Rp 300.000 - 700.000 | 2-3x/minggu | > Rp 800.000/sesi |
| Fisioterapi rehabilitasi post-op | Rp 350.000 - 800.000 | 3-5x/minggu (4-6 minggu) | > Rp 1.000.000/sesi |
| Chiropractic | Rp 300.000 - 600.000 | 1-2x/minggu | > Rp 700.000/sesi |

**Total biaya fisioterapi wajar per episode:**
- Nyeri punggung akut: 8-12 sesi, total Rp 2.400.000 - 6.000.000
- Post-operasi tulang: 12-20 sesi, total Rp 4.200.000 - 16.000.000
- Rehabilitasi stroke: 20-40 sesi, total Rp 7.000.000 - 32.000.000

---

## 2. Frekuensi Klaim Normal

### 2.1 Per Peserta

| Tipe Peserta | Klaim/Tahun | Klaim/Bulan | Flag MEDIUM | Flag HIGH |
|-------------|-------------|-------------|-------------|-----------|
| Individual sehat (< 40 thn) | 2-4 | 0-1 | > 6/tahun | > 10/tahun |
| Individual (40-55 thn) | 3-6 | 0-1 | > 8/tahun | > 12/tahun |
| Individual (> 55 thn) | 4-8 | 0-2 | > 10/tahun | > 15/tahun |
| Keluarga (4 orang) | 6-12 | 1-2 | > 15/tahun | > 24/tahun |

### 2.2 Per Diagnosis (Per Peserta Per Tahun)

| Diagnosa | Normal | Mencurigakan | Sangat Mencurigakan |
|----------|--------|-------------|---------------------|
| Flu / ISPA (J06.9) | 1-3x | 4-6x | > 6x |
| Nyeri punggung (M54.5) | 1-2 episode | 3-4 episode | > 4 episode |
| Gastritis (K29.7) | 1-2x | 3-4x | > 4x |
| Rawat inap (any) | 0-1x | 2x | > 2x |
| Fisioterapi (total sesi) | 12-20 sesi | 21-30 sesi | > 30 sesi |

### 2.3 Pola Klaim yang Mencurigakan

- **Cluster klaim:** > 3 klaim dalam 2 minggu
- **Klaim beruntun:** Setiap bulan selama > 4 bulan berturut-turut
- **Eskalasi biaya:** Biaya klaim meningkat > 50% tiap klaim berikutnya
- **Provider tunggal:** > 80% klaim ke satu provider (kecuali RS langganan)
- **Klaim akhir polis:** Lonjakan klaim dalam 2 bulan terakhir sebelum polis expire

---

## 3. Statistik Provider

### 3.1 Benchmark Klaim per Tipe Provider per Bulan

| Tipe Provider | Klaim Normal/Bulan | Flag MEDIUM | Flag HIGH |
|--------------|-------------------|-------------|-----------|
| RS Besar (> 200 bed) | 50-150 | > 200 | > 300 |
| RS Sedang (100-200 bed) | 30-80 | > 120 | > 180 |
| RS Kecil (< 100 bed) | 15-40 | > 60 | > 100 |
| Klinik umum | 8-25 | > 40 | > 60 |
| Klinik spesialis | 10-30 | > 50 | > 80 |
| Klinik fisioterapi | 8-20 | > 35 | > 50 |
| Laboratorium | 20-50 | > 80 | > 120 |
| Apotek | 15-40 | > 60 | > 100 |

### 3.2 Rasio Klaim Mencurigakan per Provider

| Metrik | Normal | Waspada | Watchlist |
|--------|--------|---------|-----------|
| % klaim bernilai > Rp 10 juta | < 20% | 20-35% | > 35% |
| % klaim ditolak | < 5% | 5-15% | > 15% |
| Rata-rata biaya per klaim vs peer | ± 20% | 20-40% lebih tinggi | > 40% lebih tinggi |
| % klaim dari peserta yang sama | < 5% | 5-10% | > 10% |
| Klaim diagnosa tunggal dominan | < 30% | 30-50% | > 50% |

### 3.3 Indikator Provider Watchlist

Provider masuk watchlist jika memenuhi 2 atau lebih kriteria:
1. Volume klaim > 150% dari rata-rata peer selama 3 bulan berturut-turut
2. Rata-rata biaya per klaim > 130% dari benchmark kota
3. > 3 klaim ditolak karena fraud dalam 12 bulan
4. Pola klaim seragam (diagnosa sama, nominal mirip) > 40% dari total
5. Dilaporkan oleh peserta atau pihak ketiga
6. Hasil audit menemukan ketidaksesuaian dokumentasi

---

## 4. Threshold Rule Engine

### 4.1 Threshold Finansial

| Parameter | Nilai | Digunakan oleh Rule |
|-----------|-------|---------------------|
| Klaim kesehatan bernilai tinggi | > Rp 50.000.000 | RULE 6: HIGH_VALUE |
| Klaim jiwa bernilai tinggi | > Rp 500.000.000 | RULE 6: HIGH_VALUE |
| Selisih biaya vs benchmark (MEDIUM) | > 40% di atas rata-rata | RULE Benchmark |
| Selisih biaya vs benchmark (HIGH) | > 100% di atas rata-rata | RULE Benchmark |

### 4.2 Threshold Temporal

| Parameter | Nilai | Digunakan oleh Rule |
|-----------|-------|---------------------|
| Klaim terlalu cepat setelah polis | < 30 hari | Flag informasional |
| Polis baru + klaim besar (kesehatan) | < 6 bulan + > Rp 20 juta | MEDIUM flag |
| Polis baru + klaim besar (jiwa) | < 24 bulan + > UP | RULE 7: LF-06 |
| Frekuensi tinggi (MEDIUM) | > 5 klaim/30 hari | RULE 4: HF-07 |
| Frekuensi tinggi (HIGH) | > 10 klaim/30 hari | RULE 4: HF-07 |
| Batas waktu klaim kesehatan | > 30 hari setelah layanan | Flag informasional |
| Batas waktu klaim jiwa | > 90 hari setelah kejadian | Flag informasional |

### 4.3 Threshold Scoring Final

| Risk Level | Score Range | Tindakan Otomatis |
|------------|-------------|-------------------|
| LOW | 0 - 29 | Auto-approve, proses standar |
| MEDIUM | 30 - 69 | Masuk antrian review CS, hold pembayaran |
| HIGH | 70 - 100 | Freeze klaim, eskalasi ke SIU |

**Override Rules:**
- Flag CRITICAL ditemukan → minimum score = 80
- Provider watchlist → score + 20
- 2+ flags HIGH pada klaim yang sama → minimum score = 70
