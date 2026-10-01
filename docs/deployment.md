# Deployment — CI/CD ke VPS (aaPanel)

Alur: **push ke `main`** → CI/CD GitHub Actions → image di-push ke **GHCR** → SSH ke VPS → sinkron compose → `docker compose pull && up -d` → health check `/health` → **auto-rollback** bila gagal.

```
push main ──▶ GitHub Actions
              ├─ quality: typecheck + build + test (Node 22)
              ├─ build-push: docker build → ghcr.io/<owner>/<repo>:sha-xxxxxxx + :latest
              └─ deploy (SSH ke VPS): git sync → tag rollback target
                                      → compose pull + up -d
                                      → curl /health → rollback bila gagal
```

Realita server saat ini (sudah berjalan):

| Item | Nilai |
|---|---|
| Panel | aaPanel |
| User SSH deploy | `root` (via SSH key dari GitHub Actions) |
| Path project | `/www/wwwroot/wabot` |
| Runtime app | Docker Compose |
| WAHA | di VPS yang sama |

---

## 1. Secret GitHub yang wajib diisi

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Nilai untuk server ini | Keterangan |
|---|---|---|
| `VPS_HOST` | IP/domain VPS Anda | |
| `VPS_PORT` | `22` | Port SSH (opsional, default 22) |
| `VPS_USER` | `root` | SSH sebagai root (aaPanel) |
| `VPS_SSH_KEY` | isi private key lengkap | Langkah 2 di bawah |
| `VPS_APP_DIR` | `/www/wwwroot/wabot` | Path project di server |
| `VPS_HEALTH_URL` | `http://127.0.0.1:3001/health` | Opsional — default sudah ini |

> `GITHUB_TOKEN` otomatis tersedia untuk push ke GHCR — tidak perlu dibuat.

---

## 2. Generate SSH key untuk GitHub Actions (sekali saja)

Di mesin lokal:

```bash
ssh-keygen -t ed25519 -f wabot_deploy_key -N ""
```

Lalu di VPS (sebagai root):

```bash
mkdir -p /root/.ssh && chmod 700 /root/.ssh
cat wabot_deploy_key.pub >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
```

- **Private key** (`wabot_deploy_key`, termasuk baris `BEGIN`/`END`) → secret `VPS_SSH_KEY`.
- Uji dari lokal: `ssh -i wabot_deploy_key root@VPS_HOST "echo ok"` → harus `ok`.

> Catatan: aaPanel kadang mengubah `PermitRootLogin`. Pastikan di `/etc/ssh/sshd_config` ada `PermitRootLogin prohibit-password` (bukan `no`), lalu `systemctl restart sshd`.

---

## 3. One-time setup di VPS (sebagian sudah ada)

### a. Docker + Compose — sudah terpasang (app berjalan). Verifikasi:

```bash
docker compose version
```

### b. Direktori app `/www/wwwroot/wabot` — sudah ada. Pastikan berisi:

```bash
cd /www/wwwroot/wabot
ls   # docker-compose.yml  .env  data/
```

Bila `docker-compose.yml` belum versi terbaru (dengan `image: ${WABOT_IMAGE:-wabot:local}`), ambil dari repo:

```bash
cd /www/wwwroot/wabot
# bila belum clone git:
git clone https://github.com/clone4truth/wabot.git /www/wwwroot/wabot-git && \
  cp /www/wwwroot/wabot-git/docker-compose.yml /www/wwwroot/wabot/
```

### c. `.env` — pastikan lengkap (bot + WAHA di VPS yang sama):

```bash
cd /www/wwwroot/wabot
cat > .env <<'EOF'
WAHA_BASE_URL=http://waha:3000        # sesuaikan: nama container/network WAHA
WAHA_API_KEY=your-real-api-key
WAHA_SESSION=default
WAHA_WEBHOOK_HMAC_KEY=your-real-hmac-key
EOF
chmod 600 .env
```

> Karena WAHA jalan di VPS yang sama, `WAHA_BASE_URL` mengarah ke container/network WAHA lokal — bukan domain publik.

### d. Login GHCR agar bisa pull image (repo publik → image default private):

```bash
# GitHub → Settings → Developer settings → PAT (classic) → scope: read:packages
echo "YOUR_GHCR_PAT" | docker login ghcr.io -u clone4truth --password-stdin
```

### e. Health URL antar-container

Health check di workflow menembak `http://127.0.0.1:3001/health` (port compose bot). Bila nanti bot diubah ke network internal tanpa port publik, set secret `VPS_HEALTH_URL` sesuai.

---

## 4. Deploy

Cukup push ke `main`:

```bash
git push origin main
```

Atau manual: **Actions → CD → Run workflow**.

Yang dilakukan pipeline:

1. **quality** — typecheck + build + test (Node 22, ffmpeg).
2. **build-push** — push `ghcr.io/<owner>/<repo>:sha-<7-char>` + `:latest` ke GHCR.
3. **deploy** — SSH ke VPS:
   - `git fetch && git reset --hard origin/main` di `/www/wwwroot/wabot` (menyamakan compose; `data/` dan `.env` diabaikan git → aman).
   - Tag image berjalan sebagai `:latest-previous` (target rollback).
   - `WABOT_IMAGE=ghcr.io/...:sha-xxxx docker compose pull && up -d --remove-orphans`.
   - Health check `curl /health` hingga 60 detik.
   - Gagal → **rollback otomatis** ke `:latest-previous`.

---

## 5. Rollback

### Otomatis — health check gagal → job Rollback jalan:

```bash
WABOT_IMAGE=ghcr.io/<owner>/<repo>:latest-previous docker compose up -d
```

### Manual dari VPS:

```bash
cd /www/wwwroot/wabot
docker images ghcr.io/clone4truth/wabot
WABOT_IMAGE=ghcr.io/clone4truth/wabot:sha-abc1234 docker compose up -d
```

---

## 6. aaPanel notes

- **Jangan jalankan bot via "Python project / Node project" aaPanel** — runtime resmi adalah Docker Compose; panel hanya dipakai untuk monitoring/nginx.
- **Reverse proxy**: di aaPanel buat site → Proxy ke `http://127.0.0.1:3001` untuk endpoint webhook (WAHA → bot). TLS via Let's Encrypt aaPanel.
- Compose mem-bind `127.0.0.1:3001` saja — bot tidak terekspos publik langsung.
- Logs: `docker compose logs -f sticker-bot` (dibatasi 10MB × 3 file agar disk aman).
- Data persisten: `/www/wwwroot/wabot/data` (bind mount ke `/app/data`).

---

## 7. Dashboard Admin

Panel admin (Vue 3 + shadcn-vue) disajikan Fastify di `/dashboard` — satu container,
tanpa web server tambahan.

Aktif di VPS dengan menambahkan ke `.env`:

```bash
ADMIN_PASSWORD=<password-kuat>
```

Dikosongkan ⇒ dashboard mati total (`/api/admin/*` membalas 503) dan tidak ada
permukaan admin yang perlu dikuatkan.

Build sudah ikut di pipeline Docker (`dashboard-builder` stage → `/app/dashboard-dist`),
jadi tidak ada langkah manual setelah deploy. Kalau route `/dashboard` 404, cek log
startup: `Dashboard SPA belum di-build`.

Reverse proxy (aaPanel/Caddy) tidak perlu rule tambahan — cukup arahkan path yang
sudah ada ke `127.0.0.1:3001`. Pastikan tidak ada basic-auth di lapisan proxy yang
menggantikan login dashboard, dan sajikan lewat HTTPS: cookie session memakai flag
`Secure` saat `APP_ENV=production`.

Operasi dari dashboard (edit limit runtime, prefix per chat, restart, purge temp)
langsung menulis ke `bot-state.json` di volume `./data` — jadi bertahan melewati
restart container.

---

## 8. Troubleshooting

| Gejala | Kemungkinan | Solusi |
|---|---|---|
| SSH gagal di job deploy | Key/`PermitRootLogin` | Cek secret `VPS_SSH_KEY`, pastikan `prohibit-password`, restart sshd |
| `denied` saat `compose pull` | GHCR belum login | Langkah 3d — `docker login ghcr.io` |
| `git reset --hard` gagal | Folder bukan clone git | Jalankan `git clone` atau biarkan (step di-skip bila tidak ada `.git`) |
| Health check gagal, container jalan | WAHA belum siap / URL salah | Cek `WAHA_BASE_URL`; `/health` hanya liveness bot |
| Webhook WAHA tidak sampai | Reverse proxy belum diarahkan | aaPanel proxy → `127.0.0.1:3001` |
| `/dashboard` 404 | SPA belum ter-build | `cd dashboard && npm run build`, atau cek log `Dashboard SPA belum di-build` |
| Dashboard 503 | `ADMIN_PASSWORD` kosong | Set di `.env`, lalu restart container |
| `EMFILE` di log | Bocor FD (regresi) | `docker compose exec sticker-bot sh -c 'ls /proc/1/fd \| wc -l'` — harus stabil, tidak naik per request |
| OOM-kill di `docker inspect` | Memori container habis | Naikkan `STICKER_BOT_MEM_LIMIT`, atau turunkan `MAX_INPUT_PIXELS` / `MAX_*_JOBS` |

---

## 8. Catatan keamanan

- `.env` (kredensial nyata) permission `600`, tidak pernah masuk git/image.
- SSH key deploy = akses root. Simpan private key hanya di GitHub Secrets, dan rotasi bila terindikasi bocor.
- `security_opt: no-new-privileges`, `tmpfs /tmp`, log rotation sudah aktif di compose.
- Pertimbangkan membatasi SSH ke key-only (`PasswordAuthentication no`).
- Dashboard memakai password tunggal + session cookie `HttpOnly`/`SameSite=Strict`.
  Ganti password lalu gunakan "Cabut semua sesi" bila password pernah terekspos.
- `mem_limit`/`cpus`/`pids_limit` di compose bukan opsional: tanpa batas, lonjakan
  sharp/ffmpeg membuat kernel OOM-kill seluruh host beserta WAHA.
