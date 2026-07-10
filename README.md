# Дайджест-бот с кнопками (Cloudflare Workers + GitHub)

Бот показывает разделы последнего дайджеста по inline-кнопкам. Деплой через GitHub: коммит в main → Cloudflare пересобирает воркер.

## Деплой

1. **KV:** dash.cloudflare.com → Storage & Databases → KV → Create namespace `DIGEST` → скопируй ID и вставь в `wrangler.toml` (прямо на GitHub через Edit).
2. **Импорт репы:** Workers & Pages → Create → вкладка Workers → Import a repository → авторизуй GitHub → выбери Howgad/Digest → deploy command `npx wrangler deploy` → Deploy.
3. **Секреты:** страница воркера → Settings → Variables and Secrets → добавь тип Secret: `BOT_TOKEN` (из BotFather), `WEBHOOK_SECRET` (строка 20+ символов), `UPDATE_SECRET` (другая строка). `CHAT_ID` уже в wrangler.toml.
4. **Вебхук:** в адресной строке браузера:
   `https://api.telegram.org/bot<ТОКЕН>/setWebhook?url=<URL_ВОРКЕРА>/webhook&secret_token=<WEBHOOK_SECRET>`
   → ответ `{"ok":true}`.
5. **Проверка:** напиши боту `/menu` — придёт меню с кнопками.

## Диагностика
- Логи: страница воркера → Logs → Begin log stream.
- Вебхук: `https://api.telegram.org/bot<ТОКЕН>/getWebhookInfo` (поле `last_error_message`).
- Деплой упал → вкладка Builds; обычно не вставлен ID неймспейса в wrangler.toml.
