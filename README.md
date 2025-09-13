# Creatify Post Generator (Next.js 14 + Make.com)

Prosty generator postów z linku do produktu. Flow:
1. Użytkownik wkleja **URL produktu**.
2. Backend woła **Google Generative AI** i generuje szkic posta.
3. Użytkownik **edytuje i zatwierdza** treść.
4. Backend wysyła payload do **Make.com Webhook**, gdzie scenariusz publikuje post na wybranej platformie.

## Szybki start

```bash
pnpm install
cp .env.local.example .env.local
# Uzupełnij .env.local
pnpm dev
```

Otwórz: http://localhost:3000

## Licencja
MIT – dostosuj według potrzeb.