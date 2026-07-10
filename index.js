// Интерактивный дайджест-бот для Telegram на Cloudflare Workers.
// Выпуск читается из digest.json в этом же GitHub-репозитории.
// Крон раз в 15 минут проверяет новый выпуск и присылает меню.

const RAW_URL = "https://raw.githubusercontent.com/Howgad/Digest/main/digest.json";

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

async function getDigest() {
  try {
    const r = await fetch(`${RAW_URL}?t=${Date.now()}`, {
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

async function sendMenu(env, chatId) {
  const d = await getDigest();
  const header = d
    ? `📰 <b>Дайджест арбитража — ${d.date}</b>\nВыбери раздел:`
    : "Пока нет выпусков — загляни после утреннего дайджеста.";
  await tg(env, "sendMessage", {
    chat_id: chatId,
    text: header,
    parse_mode: "HTML",
    reply_markup: menuKeyboard(),
  });
}

async function sendSection(env, chatId, key) {
  const d = await getDigest();
  if (!d) {
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: "Пока нет выпусков — загляни после утреннего запуска.",
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/webhook")
      return handleWebhook(request, env);
    return new Response("OK");
  },

  // Крон: если в digest.json новая дата — прислать меню владельцу.
  async scheduled(event, env, ctx) {
    const d = await getDigest();
    if (!d?.date) return;
    const last = await env.DIGEST.get("notified_date");
    if (d.date === last) return;
    await env.DIGEST.put("notified_date", d.date);
    await tg(env, "sendMessage", {
      chat_id: env.CHAT_ID,
      text: `📰 <b>Дайджест арбитража — ${d.date}</b>\nСвежий выпуск готов, выбери раздел:`,
      parse_mode: "HTML",
      reply_markup: menuKeyboard(),
    });
  },
};
