# GitHub Actions — devrede

İş akışı `.github/workflows/deploy.yml` altında ve aktif.

Bir süre bu klasörde bekledi çünkü push için kullanılan token'da `workflow`
yetkisi yoktu; GitHub workflow dosyalarını ayrı bir izin olarak koruyor ve
o dosya yüzünden **bütün push** düşüyordu.

## Çalışması için kalan adımlar

`docs/DEPLOYMENT.md` §2.2 ve §3:

1. **5 secret** — Settings → Secrets and variables → Actions
   `VPS_HOST`, `VPS_USER`, `VPS_SSH_PORT`, `VPS_SSH_KEY`, `VPS_APP_PATH`
2. **production environment** — Settings → Environments → `production`
   → Required reviewers ekle
3. **(B) SSH anahtarı** — Mac'te üret, `ssh-copy-id` ile sunucuya kur,
   özel yarısını `VPS_SSH_KEY` secret'ına yapıştır

Bunlar tamamlanana kadar `deploy` işi başarısız olur; `verify` işi
(derleme + kod bütünlüğü kontrolü) her push'ta çalışmaya devam eder.
