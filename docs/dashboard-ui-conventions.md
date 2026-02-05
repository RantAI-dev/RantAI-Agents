# Dashboard UI Conventions

Satu sumber kebenaran untuk spacing, header, dialog, dan warna di dashboard. Pakai dokumen ini saat menambah atau mengubah halaman dashboard.

---

## 1. Header halaman

Semua halaman dashboard memakai **satu pola header** yang sama.

### Kelas standar

- **Container:** `min-h-14 flex items-center border-b bg-background`
- **Padding:** `pl-14 pr-4 py-3` (sesuai sidebar; sesuaikan jika layout berubah)
- **Layout:** Gunakan `flex items-center justify-between w-full` jika ada judul + area aksi; cukup `flex items-center` jika hanya judul.

### Contoh

```tsx
<header className="min-h-14 flex items-center justify-between border-b bg-background pl-14 pr-4 py-3">
  <div>
    <h1 className="text-lg font-semibold">Judul Halaman</h1>
    {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
  </div>
  {actions && <div className="flex items-center gap-2">{actions}</div>}
</header>
```

### Catatan

- Tinggi konsisten: `min-h-14` (56px).
- Selalu pakai `border-b` dan `bg-background` agar terpisah dari konten.
- Judul halaman: `text-lg font-semibold`; subtitle opsional: `text-sm text-muted-foreground`.

---

## 2. Dialog

Struktur dialog seragam: **Header (Title + optional Description) → Body → Footer**.

### Kelas standar

- **DialogContent:** Padding `p-6`; gap antar anak `gap-4`.
- **DialogHeader:** Berisi `DialogTitle` (wajib) dan `DialogDescription` (jika ada penjelasan).
- **DialogTitle:** `text-lg font-semibold`.
- **DialogFooter:** `flex justify-end gap-2`. Tombol batal di kiri, aksi utama di kanan.
- **Max-width:** Default dari komponen UI (mis. `max-w-lg`). Untuk dialog form lebar boleh `max-w-2xl` via `className` pada `DialogContent`.

### Tombol

- **Aksi utama:** `Button` variant default (primary).
- **Batal / secondary:** `variant="outline"` atau `variant="ghost"`.

### Contoh struktur

```tsx
<Dialog>
  <DialogContent className="p-6 gap-4 max-w-2xl">
    <DialogHeader>
      <DialogTitle className="text-lg font-semibold">Judul Dialog</DialogTitle>
      <DialogDescription>Penjelasan singkat bila perlu.</DialogDescription>
    </DialogHeader>
    <div>{/* body: form / konten */}</div>
    <DialogFooter className="flex justify-end gap-2">
      <Button variant="outline" onClick={onCancel}>Batal</Button>
      <Button onClick={onSubmit}>Simpan</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## 3. Warna semantik (token tema)

Gunakan **token dari `app/globals.css`**; jangan pakai kelas warna hardcoded (`green-*`, `blue-*`, `amber-*`, `red-*`) untuk makna status/success/info/danger.

### Mapping

| Makna | Token | Contoh kelas |
|-------|--------|---------------|
| Success / aktif / selesai | `chart-2` | `bg-chart-2`, `text-chart-2`, `bg-chart-2/10` |
| Info / informatif | `chart-3` | `bg-chart-3`, `text-chart-3`, `bg-chart-3/10` |
| Perhatian / default / favorit | `chart-1` | `bg-chart-1`, `text-chart-1`, `bg-chart-1/10` |
| Danger / hapus / error | `destructive` | `bg-destructive`, `text-destructive`, `bg-destructive/10` |

### Catatan

- Untuk latar dekoratif (info box, badge) pakai opacity: `bg-chart-2/10`, `bg-chart-3/10`, dll.
- Teks di atas latar berwarna harus tetap terbaca (kontras cukup); sesuaikan di fase aksesibilitas jika perlu.

---

## 4. Spacing & section (referensi Fase 5)

- **Container konten:** Padding seragam, mis. `p-6` atau `max-w-* mx-auto p-6`.
- **Jarak antar section:** `space-y-6` atau `space-y-8`.
- **Card/section:** Konsisten `rounded-lg`; border/shadow dari komponen Card.
- **Judul halaman:** Satu tingkat (`text-lg font-semibold`); judul section satu tingkat di bawah.

---

*Terakhir diperbarui mengikuti plan Dashboard UI – Clean, Konsisten, Cantik.*
