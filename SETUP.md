# Setup — formular contact Marius Ciprian Pop

Formularul scrie în două locuri simultan:
1. **Google Sheet** (stocare) — prin Google Sheets API + Service Account
2. **Resend** (notificare email) — către adresele din `NOTIFICATION_RECIPIENTS`

Acest document descrie cum să refaci setup-ul de la zero. Dacă totul funcționează deja, îl poți ignora.

---

## 1. Google Cloud — Service Account (o singură dată)

1. https://console.cloud.google.com/projectcreate → creează un proiect nou
2. Enable **Google Sheets API**: https://console.cloud.google.com/apis/library/sheets.googleapis.com
3. **APIs & Services → Credentials → + Create Credentials → Service Account**
   - Name: ex. `mcp-form-writer`
   - Skip role & user → Done
4. Click pe service account → tab **Keys** → **Add Key → Create new key → JSON** → se descarcă un `.json`

## 2. Google Sheet

Service account-urile Google **nu au Drive storage** — nu pot crea fișiere, doar scrie în sheet-uri existente. Deci tu creezi sheet-ul:

1. https://sheets.new → redenumește-l ex. „Marius Ciprian Pop"
2. Click **Share** → lipește email-ul service account-ului (din câmpul `client_email` al JSON-ului, ex: `mcp-546@...iam.gserviceaccount.com`) → rol **Editor** → debifează „Notify people" → Share
3. Copiază URL-ul sheet-ului. ID-ul e partea dintre `/d/` și `/edit` (44 caractere).

## 3. Resend

1. Cont la https://resend.com (free: 100 emailuri/zi, 3000/lună)
2. **API Keys → Create API Key** cu „Sending access" → copiază cheia (începe cu `re_`)
3. **Opțional**: verifică un domeniu (ex. `notify.mariusciprianpop.ro`) în Domains → Add Domain → adaugă 3 DNS records → după verificare poți folosi `contact@notify.mariusciprianpop.ro` ca FROM.

## 4. Variabile de mediu

### 4.1 Local — `site/.env` (gitignored)
Copiază [.env.example](.env.example) → `.env` și completează:
```bash
GOOGLE_SERVICE_ACCOUNT_JSON='{...JSON pe o singura linie...}'
GOOGLE_SHEET_ID=1AbCd...XyZ
RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
EMAIL_TO=destinatar-principal@example.com
EMAIL_TO_BCC=bcc1@example.com,bcc2@example.com,bcc3@example.com
FROM_EMAIL=Marius Ciprian Pop <contact@mariusciprianpop.ro>
```

**Trucul pentru JSON pe o linie**: în VS Code deschide `.json` descărcat, `Ctrl+A`, apoi `Ctrl+Shift+P` → „Join Lines" → copiază rezultatul între ghilimele simple.

### 4.2 Vercel — prin CLI (deja autentificat)
```bash
cd site
# Pentru fiecare variabilă, pe fiecare environment:
vercel env add GOOGLE_SERVICE_ACCOUNT_JSON production
vercel env add GOOGLE_SERVICE_ACCOUNT_JSON preview
vercel env add GOOGLE_SERVICE_ACCOUNT_JSON development
# ... la fel pentru GOOGLE_SHEET_ID, RESEND_API_KEY, NOTIFICATION_RECIPIENTS, FROM_EMAIL
```

Sau alternative:
- **Vercel Dashboard** → proiectul `mariusciprianpop` → Settings → Environment Variables → Add fiecare variabilă
- **Push din .env local**: `vercel env pull` descarcă, `vercel env add < .env` nu există nativ — folosește dashboard-ul sau CLI-ul cu fiecare var

## 5. Bootstrap sheet-ului (headers, formatare)

După ce ai `.env` complet, rulează o dată:
```bash
cd site
npm install
node scripts/bootstrap-sheet.js
```
Asta:
- Redenumește prima foaie în „Submissions"
- Scrie cele 8 headere
- Bold + background gri pe header
- Frozen row 1
- Autoresize coloane

## 6. Deploy

```bash
cd site
git add .
git commit -m "feat: contact form"
git push origin master
```
Vercel prinde push-ul automat. ~1 min până e live pe production.

## 7. Test E2E

Din terminal:
```bash
curl -i -X POST https://www.mariusciprianpop.com/api/contact \
  -H "Content-Type: application/json" \
  -d '{"nume":"Test E2E","telefon":"0700000000","email":"test@test.com","terms_accepted":true,"source":"curl-test"}'
```

Aștept-te la:
- HTTP 200 cu `{"ok":true,"partial":false,"results":{"sheet":"ok","email":"ok"}}`
- Rând nou în Google Sheet
- Email în inboxul din `NOTIFICATION_RECIPIENTS`

Dacă e `partial:true`, verifică Vercel → Deployments → (deploy) → Runtime Logs pentru eroarea specifică.

---

## Coloane Google Sheet (referință)

| # | Coloană           | Tip              | Exemplu                                  |
|---|-------------------|------------------|------------------------------------------|
| A | Timestamp         | ISO date         | `2026-04-23T14:32:11.000Z`               |
| B | Nume              | text             | `Ion Popescu`                            |
| C | Telefon           | text             | `+40 712 345 678`                        |
| D | Email             | text             | `ion@example.com`                        |
| E | Terms Accepted    | `YES` / `NO`     | `YES`                                    |
| F | User Agent        | text             | `Mozilla/5.0 ...`                        |
| G | IP                | text             | `82.77.45.12`                            |
| H | Source            | text             | `mariusciprianpop.ro`                    |
