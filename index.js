// Интерактивный дайджест-бот для Telegram на Cloudflare Workers.
// Хранит последний выпуск дайджеста в KV и отдаёт разделы по inline-кнопкам.

const SECTION_TITLES = {
  glavnoe: "🔥 Главное",
  platezhki: "💳 Платёжки и карты",
  platformy: "📣 Платформы",
  industriya: "🌐 Индустрия",
};

function menuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🔥 Главное", callback_data: "sec:glavnoe" },
        { text: "💳 Платёжки", callback_data: "sec:platezhki" },
      ],
      [
        { text: "📣 Платформы", callback_data: "sec:platformy" },
        { text: "🌐 Индустрия", callback_data: "sec:industriya" },
      ],
      [{ text: "📖 Весь выпуск", callback_data: "sec:full" }],
    ],
  };
}

async function tg(env, method, payload) {
  const res = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  return res.json();
}

// Разбивает длинный текст на куски <= limit, стараясь резать по абзацам.
function splitText(text, limit = 4000) {
  if (text.length <= limit) return [text];
  const chunks = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = limit;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, "");
  }
  if (rest) chunks.push(rest);
  return chunks;
}

async function sendHtml(env, chatId, text, extra = {}) {
  for (const chunk of splitText(text)) {
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: chunk,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...extra,
    });
  }
}

async function getDigest(env) {
  const raw = await env.DIGEST.get("latest");
  return raw ? JSON.parse(raw) : null;
}

async function sendMenu(env, chatId) {
  const d = await getDigest(env);
  const header = d
    ? `📰 <b>Дайджест арбитража — ${d.date}</b>\nВыбери раздел:`
    : "Пока нет сохранённых выпусков. Меню заработает после ближайшего утреннего дайджеста.";
  await tg(env, "sendMessage", {
    chat_id: chatId,
    text: header,
    parse_mode: "HTML",
    reply_markup: menuKeyboard(),
  });
}

async function sendSection(env, chatId, key) {
  const d = await getDigest(env);
  if (!d) {
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: "Пока нет сохранённых выпусков — загляни после утреннего запуска.",
    });
    return;
  }
  let text;
  if (key === "full") {
    text = Object.keys(SECTION_TITLES)
      .map((k) => d.sections[k])
      .filter(Boolean)
      .join("\n\n———\n\n");
    if (!text) text = "Выпуск пуст.";
  } else {
    text =
      d.sections[key] ||
      `${SECTION_TITLES[key] || key}: в этом выпуске раздел пуст.`;
  }
  await sendHtml(env, chatId, text);
}

async function handleWebhook(request, env) {
  // Telegram присылает секрет, заданный при setWebhook — отсекаем чужие запросы.
  if (
    request.headers.get("x-telegram-bot-api-secret-token") !==
    env.WEBHOOK_SECRET
  ) {
    return new Response("forbidden", { status: 403 });
  }
  const update = await request.json();

  if (update.message?.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text.trim().toLowerCase();
    if (text === "/start" || text === "/menu" || text === "меню") {
      await sendMenu(env, chatId);
    } else {
      await tg(env, "sendMessage", {
        chat_id: chatId,
        text: "Команды: /menu — разделы последнего выпуска.",
      });
    }
  } else if (update.callback_query) {
    const cq = update.callback_query;
    await tg(env, "answerCallbackQuery", { callback_query_id: cq.id });
    if (cq.data?.startsWith("sec:")) {
      await sendSection(env, cq.message.chat.id, cq.data.slice(4));
    }
  }
  return new Response("ok");
}

async function handleUpdate(request, env) {
  // Сюда ежедневная задача заливает свежий выпуск.
  if (request.headers.get("x-update-secret") !== env.UPDATE_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const body = await request.json();
  // Ожидаемый формат: { date: "10.07.2026", sections: { glavnoe: "<b>..</b>", platezhki: "..", platformy: "..", industriya: ".." } }
  if (!body?.date || typeof body.sections !== "object") {
    return new Response("bad request", { status: 400 });
  }
  await env.DIGEST.put("latest", JSON.stringify(body));
  // Уведомляем владельца и показываем меню.
  await tg(env, "sendMessage", {
    chat_id: env.CHAT_ID,
    text: `📰 <b>Дайджест арбитража — ${body.date}</b>\nВыпуск готов, выбери раздел:`,
    parse_mode: "HTML",
    reply_markup: menuKeyboard(),
  });
  return new Response("stored");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/webhook")
      return handleWebhook(request, env);
    if (request.method === "POST" && url.pathname === "/update")
      return handleUpdate(request, env);
    return new Response("OK");
  },
};
