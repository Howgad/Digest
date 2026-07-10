// Дайджест-бот v2: разделы, архив, итоги недели, хаб возможностей.

const RAW = "https://raw.githubusercontent.com/Howgad/Digest/main";

const SECTION_TITLES = {
  glavnoe: "🔥 Главное",
  platezhki: "💳 Платёжки и конкуренты",
  platformy: "📣 Платформы",
  zapad: "🌍 Запад",
  industriya: "🌐 Индустрия",
};

const WEEKLY_TITLES = {
  itogi: "🏆 Топ недели",
  konkurenty: "📊 Радар конкурентов",
  otzyvy: "🗣 Отзывы о MyBrocard",
};

const HELP_TEXT = `ℹ️ <b>Что умеет этот бот</b>\n\n📰 <b>Ежедневный дайджест</b> — по будням утром. Разделы:\n🔥 Главное — важнейшее + строка «→ CS», как использовать в работе\n💳 Платёжки и конкуренты — карты, BIN, радар по PST.NET, FlexCard и др.\n📣 Платформы — политики FB/Google/TikTok\n🌍 Запад — новости из EN-источников на русском, до того как их подхватят RU-медиа\n🌐 Индустрия — остальное\n\n📊 <b>Итоги недели</b> — каждую субботу: топ-5 новостей, полный радар конкурентов (12+ сервисов), сводка свежих отзывов о MyBrocard\n\n🗄 <b>Архив</b> — выпуски за последние 7 дней\n\n📅 <b>Месячный отчёт</b> — 1-го числа: тренды месяца и что они значат для MyBrocard\n\nКоманды: /menu — это меню в любой момент. Хэштеги в сообщениях кликабельны — по ним можно смотреть раздел за все дни.`;

function menuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🔥 Главное", callback_data: "sec:glavnoe" },
        { text: "💳 Платёжки", callback_data: "sec:platezhki" },
      ],
      [
        { text: "📣 Платформы", callback_data: "sec:platformy" },
        { text: "🌍 Запад", callback_data: "sec:zapad" },
      ],
      [
        { text: "🌐 Индустрия", callback_data: "sec:industriya" },
        { text: "📖 Весь выпуск", callback_data: "sec:full" },
      ],
      [
        { text: "📊 Итоги недели", callback_data: "wk" },
        { text: "🗄 Архив", callback_data: "arch" },
      ],
      [{ text: "ℹ️ Возможности бота", callback_data: "help" }],
    ],
  };
}

async function tg(env, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
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

async function fetchJson(path) {
  try {
    const r = await fetch(`${RAW}/${path}?t=${Date.now()}`, {
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

function joinSections(d, titles) {
  return Object.keys(titles)
    .map((k) => d.sections?.[k])
    .filter(Boolean)
    .join("\n\n———\n\n");
}

async function sendMenu(env, chatId) {
  const d = await fetchJson("digest.json");
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
  const d = await fetchJson("digest.json");
  if (!d) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Пока нет выпусков." });
    return;
  }
  let text;
  if (key === "full") {
    text = joinSections(d, SECTION_TITLES) || "Выпуск пуст.";
  } else {
    text = d.sections?.[key] || `${SECTION_TITLES[key] || key}: в этом выпуске раздел пуст.`;
  }
  await sendHtml(env, chatId, text);
}

async function sendWeekly(env, chatId) {
  const w = await fetchJson("digest-weekly.json");
  if (!w) {
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: "Итогов недели пока нет — отчёт выходит по субботам.",
    });
    return;
  }
  const text = `📊 <b>Итоги недели — ${w.date}</b>\n\n` + joinSections(w, WEEKLY_TITLES);
  await sendHtml(env, chatId, text);
}

function lastDates(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.now() - i * 86400000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function sendArchiveMenu(env, chatId) {
  const rows = [];
  const dates = lastDates(7);
  for (let i = 0; i < dates.length; i += 2) {
    const row = [{ text: `🗄 ${dates[i]}`, callback_data: `arch:${dates[i]}` }];
    if (dates[i + 1]) row.push({ text: `🗄 ${dates[i + 1]}`, callback_data: `arch:${dates[i + 1]}` });
    rows.push(row);
  }
  await tg(env, "sendMessage", {
    chat_id: chatId,
    text: "🗄 Архив — выбери дату:",
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendArchived(env, chatId, date) {
  const d = await fetchJson(`archive/${date}.json`);
  if (!d) {
    await tg(env, "sendMessage", { chat_id: chatId, text: `За ${date} выпуска нет (выходной или до запуска архива).` });
    return;
  }
  const text = `🗄 <b>Выпуск за ${d.date}</b>\n\n` + (joinSections(d, SECTION_TITLES) || "Пусто.");
  await sendHtml(env, chatId, text);
}

async function handleWebhook(request, env) {
  if (request.headers.get("x-telegram-bot-api-secret-token") !== env.WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const update = await request.json();

  if (update.message?.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text.trim().toLowerCase();
    if (text === "/start" || text === "/menu" || text === "меню") {
      await sendMenu(env, chatId);
    } else if (text === "/help") {
      await sendHtml(env, chatId, HELP_TEXT);
    } else {
      await tg(env, "sendMessage", { chat_id: chatId, text: "Жми /menu — там всё." });
    }
  } else if (update.callback_query) {
    const cq = update.callback_query;
    await tg(env, "answerCallbackQuery", { callback_query_id: cq.id });
    const chatId = cq.message.chat.id;
    const data = cq.data || "";
    if (data.startsWith("sec:")) await sendSection(env, chatId, data.slice(4));
    else if (data === "wk") await sendWeekly(env, chatId);
    else if (data === "arch") await sendArchiveMenu(env, chatId);
    else if (data.startsWith("arch:")) await sendArchived(env, chatId, data.slice(5));
    else if (data === "help") await sendHtml(env, chatId, HELP_TEXT);
  }
  return new Response("ok");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/webhook") return handleWebhook(request, env);
    return new Response("OK");
  },

  async scheduled(event, env, ctx) {
    // Новый ежедневный выпуск
    const d = await fetchJson("digest.json");
    if (d?.date) {
      const last = await env.DIGEST.get("notified_date");
      if (d.date !== last) {
        await env.DIGEST.put("notified_date", d.date);
        await tg(env, "sendMessage", {
          chat_id: env.CHAT_ID,
          text: `📰 <b>Дайджест арбитража — ${d.date}</b>\nСвежий выпуск готов, выбери раздел:`,
          parse_mode: "HTML",
          reply_markup: menuKeyboard(),
        });
      }
    }
    // Новые итоги недели
    const w = await fetchJson("digest-weekly.json");
    if (w?.date) {
      const lastW = await env.DIGEST.get("notified_weekly");
      if (w.date !== lastW) {
        await env.DIGEST.put("notified_weekly", w.date);
        await tg(env, "sendMessage", {
          chat_id: env.CHAT_ID,
          text: `📊 <b>Итоги недели — ${w.date}</b>\nОтчёт готов — жми кнопку:`,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: "📊 Читать итоги недели", callback_data: "wk" }]] },
        });
      }
    }
  },
};
