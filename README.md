# 🚀 Setup Guide — TempMail

## Langkah 1: Setup Cloudflare Email Routing

1. Buka [Cloudflare Dashboard](https://dash.cloudflare.com) → pilih domain kamu
2. Pergi ke **Email** → **Email Routing**
3. Klik **Enable Email Routing** → Cloudflare akan otomatis set MX records
4. Di tab **Destination addresses**, tambahkan Gmail kamu → verifikasi lewat link di inbox Gmail
5. Pastikan destination Gmail sudah **verified** ✅

> **Catatan:** Tidak perlu set catch-all manual — aplikasi akan otomatis membuat routing rule per email melalui Cloudflare API

---

## Langkah 1.5: Dapatkan Cloudflare API Token & Zone ID

### API Token:
1. Buka [Cloudflare Dashboard](https://dash.cloudflare.com) → klik avatar → **My Profile**
2. Pergi ke **API Tokens** → klik **Create Token**
3. Pilih **Create Custom Token**:
   - **Token name**: `TempMail Email Routing`
   - **Permissions**:
     - Zone → **Email Routing Rules** → **Edit**
     - Zone → **Email Routing Addresses** → **Read**
   - **Zone Resources**: Include → Specific zone → pilih domain kamu
4. Klik **Continue to summary** → **Create Token**
5. **Salin token** — hanya ditampilkan sekali!

### Zone ID:
1. Buka [Cloudflare Dashboard](https://dash.cloudflare.com) → pilih domain kamu
2. Di halaman **Overview**, scroll ke bawah di **sidebar kanan**
3. Salin **Zone ID**

### Account ID (Optional):
1. Di halaman yang sama, salin **Account ID** (di bawah Zone ID)

---

## Langkah 2: Setup Google Cloud Console (Gmail API)

1. Buka [Google Cloud Console](https://console.cloud.google.com)
2. Buat **New Project** → beri nama (contoh: "TempMail")
3. Pergi ke **APIs & Services** → **Library**
4. Cari **Gmail API** → klik **Enable**
5. Pergi ke **APIs & Services** → **Credentials**
6. Klik **Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: tambahkan `https://developers.google.com/oauthplayground`
7. Salin **Client ID** dan **Client Secret**

---

## Langkah 3: Dapatkan Refresh Token

1. Buka [OAuth 2.0 Playground](https://developers.google.com/oauthplayground)
2. Klik ⚙️ **Settings** (gear icon) di kanan atas:
   - Centang ✅ **Use your own OAuth credentials**
   - Masukkan **Client ID** dan **Client Secret** dari langkah 2
3. Di panel kiri, cari **Gmail API v1**
   - Pilih `https://www.googleapis.com/auth/gmail.readonly`
4. Klik **Authorize APIs** → login dengan Gmail yang menerima email
5. Klik **Exchange authorization code for tokens**
6. Salin **Refresh Token**

---

## Langkah 4: Konfigurasi Environment Variables

### Untuk Vercel (Production):

1. Buka [Vercel Dashboard](https://vercel.com) → project kamu
2. Pergi ke **Settings** → **Environment Variables**
3. Tambahkan variabel berikut:

```env
GMAIL_CLIENT_ID=xxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-xxx
GMAIL_REFRESH_TOKEN=1//xxx
EMAIL_DOMAIN=domainmu.com
GMAIL_ADDRESS=kamu@gmail.com
CLOUDFLARE_API_TOKEN=xxx
CLOUDFLARE_ZONE_ID=xxx
CLOUDFLARE_ACCOUNT_ID=xxx
```

### Untuk lokal development:

Buat file `.env` di root project dengan isi yang sama.

---

## Langkah 5: Deploy ke Vercel

### Via CLI:

```bash
npm install -g vercel
vercel login
vercel --prod
```

### Via GitHub:

1. Push project ke GitHub
2. Import repository di [vercel.com/import](https://vercel.com/import)
3. Vercel akan auto-deploy

---

## Langkah 6: Test

1. Generate email baru di web app → cek Cloudflare Email Routing → rule baru harus muncul
2. Kirim email dari email lain ke alamat temp mail yang di-generate
3. Tunggu beberapa detik — email akan muncul di inbox
4. Klik email untuk baca isi lengkapnya

---

## ⚠️ Troubleshooting

| Problem | Solusi |
|---------|--------|
| "Failed to create email route" | Cek `CLOUDFLARE_API_TOKEN` dan `CLOUDFLARE_ZONE_ID` benar |
| Route dibuat tapi email tak masuk | Cek Gmail destination sudah **verified** di Cloudflare |
| Gmail API error 401 | Refresh token expired → ulangi langkah 3 |
| Gmail API error 403 | Gmail API belum di-enable → ulangi langkah 2.4 |
| CORS error | Pastikan `vercel.json` headers sudah benar |
| Inbox kosong terus | Perlu waktu 1-5 menit untuk email masuk via Cloudflare |
| Cloudflare API 403 | API Token tidak punya permission Email Routing Rules Edit |
