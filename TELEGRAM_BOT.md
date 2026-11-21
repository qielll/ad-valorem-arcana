# Ad Valorem Telegram Bot

A personal Telegram bot for recording Ad Valorem transactions straight from
chat, without opening the web app. The bot calls a **Supabase Edge Function**
(`supabase/functions/telegram-bot/`) as its webhook, and that function writes
to the same tables as the web app using the *service role key*.

The recording flow mirrors the web **Transaction** form exactly:

```
Name -> Category (optional) -> Source (fund / account) -> Status -> Date -> Amount -> Confirmation -> Saved
```

After saving, the bot replies with a summary plus the balance of the fund
used, and an **Undo** button to delete the transaction you just created.

Available commands (Indonesian commands keep working; English aliases were
added alongside them):

| Command | What it does |
|---|---|
| `/start` | Show the menu (Add Transaction / View Balances) |
| `/catat` or `/add` | Start the recording flow |
| `/saldo` or `/balance` | Bank balances (Spending/Savings) and all fund balances |
| `/batal` or `/cancel` | Cancel the flow in progress |
| `/help` | Help on amount & date formats |

Formats the bot accepts (tuned for Indonesia — the web parser differs slightly):

- **Amounts:** `25000`, `25.000`, `1.250.000`, `25,5`, `25rb`, `150ribu`, `1,5jt`
- **Dates:** `21 Nov 2026`, `21 Oktober 2026`, `21/11/2026`, `2026-11-21`, or the Today / Yesterday buttons. Typing `hari ini` or `kemarin` also still works.

Behavior notes (same as the web):

- System categories and accounts (`Auto:*`, `Ledger`, Bank Interest, Bank Admin Fee) are never offered — those are filled by the monthly job.
- A **Planned** transaction automatically gets `is_planned = true`.
- The `periode` row is created automatically from the transaction date if it doesn't exist yet (English month names, following the web).
- Saving a transaction through the bot does **not** create a ledger row — same as saving a transaction on the web. Ledger entries remain a separate flow.

---

## Security

This function holds full write access to the database (the service role
bypasses RLS), so three layers of protection are used:

1. **Webhook secret** — Telegram sends the `X-Telegram-Bot-Api-Secret-Token` header; the function rejects (401) anything that doesn't match `TELEGRAM_WEBHOOK_SECRET`.
2. **User allowlist** — only `TELEGRAM_ALLOWED_USER_ID` is served. Anyone else gets a rejection message (which mentions their own ID, to help with setup).
3. **Closed session table** — `telegram_session` has RLS enabled with no policies; only the service role can access it.

The bot token and all secrets must **never** be committed to the repo — they
are set exclusively via `supabase secrets set`.

---

## Activation Steps (one time, on your machine)

### 1. Run the session-table migration

Apply `supabase/migrations/20261121000000_telegram_bot_session.sql` to the
live database — paste its contents into the Supabase **SQL Editor**, or use
`supabase db push` if you use the CLI. (This migration only adds a new table;
it doesn't change any existing table.)

### 2. Create the bot in BotFather

1. Chat with [@BotFather](https://t.me/BotFather) -> `/newbot` -> follow the prompts (bot name + username).
2. Save the **token** it gives you (it looks like `123456789:AA...`). Never share it with anyone.

### 3. Find your Telegram ID

Chat with [@userinfobot](https://t.me/userinfobot) — its reply contains your numeric ID.

### 4. Deploy the Edge Function

From the repo folder (Supabase CLI, already `supabase link`ed to the project):

```bash
supabase functions deploy telegram-bot --no-verify-jwt
```

The `--no-verify-jwt` flag is **required**: Telegram cannot send a Supabase
JWT, so the built-in JWT verification must be off for this function (security
is provided by the webhook secret + allowlist above).

> **Already deployed the Indonesian version?** Just re-run this same deploy
> command — it replaces the function code with the English-dialogue version.
> No migration, secret, or webhook changes are needed.

### 5. Set the secrets

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=<token from BotFather>
supabase secrets set TELEGRAM_ALLOWED_USER_ID=<your numeric ID>
supabase secrets set TELEGRAM_WEBHOOK_SECRET=<a random string you invent, e.g. the output of `openssl rand -hex 16`>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` don't need to be set — they
are available automatically in the Edge Function runtime.

### 6. Register the webhook with Telegram

Replace `<TOKEN>`, `<PROJECT_REF>`, and `<SECRET>`:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-bot" \
  -d "secret_token=<SECRET>"
```

The reply should be `{"ok":true,"result":true,"description":"Webhook was set"}`.
You can check it anytime with `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`.

> If the same token was previously used by another bot/process with polling
> (`getUpdates`), this webhook replaces it — one token can only receive
> updates one way.

### 7. Test it

1. Chat with your bot -> `/start` -> the menu appears.
2. `/saldo` (or `/balance`) -> bank and fund balances show, matching the web.
3. `/catat` (or `/add`) -> run one full flow with a small amount -> check the transaction appears in the web app.
4. Tap **Undo** -> the transaction is deleted.
5. (Optional) Chat from another Telegram account -> it must be rejected.

---

## Troubleshooting

| Symptom | Most likely cause |
|---|---|
| The bot is completely silent | The webhook isn't registered (step 6), or the URL is wrong. Check `getWebhookInfo` — the `last_error_message` field tells you more. |
| 401 responses in the function logs | The `secret_token` used at setWebhook doesn't match `TELEGRAM_WEBHOOK_SECRET`. Make them match, then set the webhook again. |
| Every chat is rejected | `TELEGRAM_ALLOWED_USER_ID` is wrong. Compare it with the ID from @userinfobot (the bot also states the sender's ID in its rejection message). |
| An error mentions `telegram_session` | The step 1 migration hasn't been applied to the live database yet. |
| Function not found / 404 | The deploy hasn't been run, or the function name isn't `telegram-bot`. |
| The flow seems to restart from the beginning | Sessions expire after 2 hours of inactivity — that's by design. Start again with `/catat` or `/add`. |

Function logs are in the Supabase Dashboard -> Edge Functions -> `telegram-bot` -> Logs.

## v1 Limitations

- **Creates** transactions only. Editing/deleting older transactions still happens on the web (Undo only covers the transaction just created in the same chat session).
- No ledger entries and no one-line quick entry mode — those are v2 candidates.
- Single user only (a one-ID allowlist).
