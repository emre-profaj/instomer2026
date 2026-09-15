# GitHub Actions iş akışı — henüz devrede değil

`deploy.yml` burada duruyor çünkü push için kullanılan Personal Access
Token'da **`workflow` yetkisi yok**. GitHub, workflow dosyalarını ayrı bir
izin olarak koruyor:

```
refusing to allow a Personal Access Token to create or update workflow
`.github/workflows/deploy.yml` without `workflow` scope
```

## Devreye almak için — iki yoldan biri

**A · Token'a yetki ekle** (tercih edilen)

GitHub → Settings → Developer settings → Personal access tokens → token'ı
düzenle → **`workflow`** kutusunu işaretle. Sonra yerelde:

```bash
git mv docs/github-actions/deploy.yml .github/workflows/deploy.yml
git commit -m "ci: iş akışını devreye al" && git push origin main
```

**B · GitHub web arayüzünden ekle**

Depo → Actions → set up a workflow yourself → `deploy.yml` içeriğini
yapıştır → Commit. Web arayüzü token yetkisine takılmaz.

## Sonra yapılacaklar

Kurulum adımları `docs/DEPLOYMENT.md` §2.2 ve §3'te:
5 secret (`VPS_HOST`, `VPS_USER`, `VPS_SSH_PORT`, `VPS_SSH_KEY`,
`VPS_APP_PATH`) ve `production` environment'ına onaylayıcı.
