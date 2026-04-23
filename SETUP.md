# Setup — formular contact Marius Ciprian Pop

Formularul trimite datele în două locuri:
1. **Google Sheet** (stocare) — prin Apps Script Web App
2. **Resend** (notificare email) — către adresele din `NOTIFICATION_RECIPIENTS`

Tot ce trebuie să faci o singură dată.

---

## 1. Google Sheet + Apps Script (10 min)

### 1.1 Creează Sheet-ul
1. Mergi pe https://sheets.new și creează un spreadsheet nou.
2. Redenumește-l: **Marius Ciprian Pop — Contact Form**.
3. Redenumește prima foaie (tab-ul de jos) din „Sheet1" → **Submissions**.

### 1.2 Pune headerele (rândul 1)
Scriptul le pune automat la primul submit, dar dacă vrei să le ai de la început, copiază în A1:H1:

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Timestamp | Nume | Telefon | Email | Terms Accepted | User Agent | IP | Source |

### 1.3 Lipește scriptul Apps Script
1. În Sheet: **Extensions → Apps Script**.
2. Se deschide editor. Șterge tot codul default.
3. Deschide fișierul `apps-script/Code.gs` din acest repo și copiază tot conținutul.
4. Lipește în editor, apasă **Save (⌘S / Ctrl+S)**.
5. Dă-i un nume proiectului, ex. „MCP Contact".

### 1.4 Publică scriptul ca Web App
1. În editor: **Deploy → New deployment**.
2. Click pe iconița ⚙ (rotiță) lângă „Select type" → alege **Web app**.
3. Configurează:
   - **Description**: `MCP contact webhook v1`
   - **Execute as**: **Me (adresa ta de Gmail)**
   - **Who has access**: **Anyone**
4. Click **Deploy**. Prima dată îți cere să autorizezi — accept.
5. La final vezi **Web app URL**. Arată așa:
   ```
   https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxx/exec
   ```
6. **Copiază URL-ul**. Acesta e `GOOGLE_SHEET_WEBHOOK_URL`.

> ⚠️ Dacă modifici scriptul mai târziu, trebuie să faci **Manage deployments → Edit → New version → Deploy**. URL-ul rămâne același.

### 1.5 Test rapid (opțional)
Din terminal:
```bash
curl -X POST "<URL_de_mai_sus>" \
  -H "Content-Type: application/json" \
  -d '{"nume":"Test","telefon":"0700000000","email":"test@test.com","terms_accepted":true,"source":"manual-test","timestamp":"2026-04-23T10:00:00Z"}'
```
Dacă vezi `{"ok":true}` și un rând nou în Sheet → e gata.

---

## 2. Resend (5 min)

1. Cont la https://resend.com (free tier: 100 emailuri/zi, 3000/lună).
2. **API Keys → Create API Key**. Permisiuni: `Sending access`. Copiază cheia (începe cu `re_`).
3. **(Opțional dar recomandat)** Verifică un domeniu propriu în **Domains → Add Domain** (ex. `mariusciprianpop.ro`). Adaugi 3 DNS records la registrar. După ce e verified, poți folosi `contact@mariusciprianpop.ro` ca FROM.
4. Fără domeniu verificat: folosește `onboarding@resend.dev` — dar doar către adresa cu care te-ai înregistrat la Resend.

---

## 3. Variabile de mediu

### Local (dezvoltare)
Editează `site/.env`:
```bash
GOOGLE_SHEET_WEBHOOK_URL=https://script.google.com/macros/s/AKfycbxxxx/exec
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
NOTIFICATION_RECIPIENTS=marius@example.com,manager@example.com
FROM_EMAIL=Marius Ciprian Pop <contact@mariusciprianpop.ro>
```

### Pe Vercel (producție + preview)
1. https://vercel.com/dashboard → proiectul `mariusciprianpop` → **Settings → Environment Variables**.
2. Adaugă fiecare variabilă din lista de mai sus:
   - Name: `GOOGLE_SHEET_WEBHOOK_URL`, Value: `<URL>`, Environments: **Production**, **Preview**, **Development** (toate)
   - La fel pentru `RESEND_API_KEY`, `NOTIFICATION_RECIPIENTS`, `FROM_EMAIL`.
3. **Save**. Variabilele sunt disponibile la deployul următor.
4. Dacă modifici valorile, trebuie să redeployezi: **Deployments → (ultimul) → ... → Redeploy**.

---

## 4. Deploy

Git-flow automat:
```bash
cd site
git add .
git commit -m "feat: formular contact cu Google Sheets + Resend"
git push origin main
```
Vercel prinde push-ul și face build automat. În ~1 minut e live.

Pentru test înainte de prod: creează un branch, push — Vercel îți generează un preview URL.

---

## 5. Testare end-to-end

După deploy + env vars completate:
1. Intră pe site → scroll la secțiunea contact.
2. Completează formularul, bifează T&C, submit.
3. Verifică:
   - Vezi „Mesajul tău a fost trimis cu succes!" pe pagină.
   - În Google Sheet apare un rând nou în **Submissions**.
   - În inboxul tău apare emailul de la Resend.

Dacă ceva nu merge, Vercel → **Deployments → (deploy) → Function Logs** îți arată erorile din `/api/contact`.

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
