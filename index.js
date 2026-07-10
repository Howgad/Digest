// Дайджест-бот v3: навигация в одном сообщении (редактирование), кнопка «В меню»,
// пагинация длинных разделов, командное меню бота (☰ у поля ввода).
// Формат callback_data: v|<view>|<page>. Views: menu, s:<key>, full, wk, arch, a:<date>, help, noop.

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

const HELP_TEXT = `ℹ️ <b>Что умеет этот бот</b>\n\n📰 <b>Ежедневный дайджест</b> — по будням утром:\n🔥 Главное — важнейшее + строка «→ CS» для работы с клиентами\n💳 Платёжки и конкуренты — радар по PST.NET, FlexCard и ещё 10 сервисам\n📣 Платформы — политики FB/Google/TikTok\n🌍 Запад — EN-новости на русском раньше RU-медиа\n🌐 Индустрия — остальное\n\n📊 <b>Итоги недели</b> — суббота: топ-5, полный радар конкурентов с 🔴/🟢, отзывы о MyBrocard\n🗄 <b>Архив</b> — выпуски за 7 дней\n📅 <b>Месячный отчёт</b> — 1-го числа: тренды + выводы для MyBrocard\n\nНавигация: всё открывается в одном сообщении, «🏠 В меню» возвращает назад. Команды в меню ☰: /menu, /weekly, /archive, /help. Хэштеги кликабельны.`;

function cb(view, page = 0) {
  return `v|${view}|${page}`;
}

function menuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🔥 Главное", callback_data: cb("s:glavnoe") },
        { text: "💳 Платёжки", callback_data: cb("s:platezhki") },
      ],
      [
        { text: "📣 Платформы", callback_data: cb("s:platformy") },
        { text: "🌍 Запад", callback_data: cb("s:zapad") },
      ],
      [
        { text: "🌐 Индустрия", callback_data: cb("s:industriya") },
        { text: "📖 Весь выпуск", callback_data: cb("full") },
      ],
      [
        { text: "📊 Итоги недели", callback_data: cb("wk") },
        { text: "🗄 Архив", callback_data: cb("arch") },
      ],
      [{ text: "ℹ️ Возможности бота", callback_data: cb("help") }],
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

function splitText(text, limit = 3800) {
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

function lastDates(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.now() - i * 86400000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function navKeyboard(view, page, total, extraRows = []) {
  const rows = [...extraRows];
  if (total > 1) {
    const nav = [];
    if (page > 0) nav.push({ text: "⬅️", callback_data: cb(view, page - 1) });
    nav.push({ text: `${page + 1}/${total}`, callback_data: cb("noop") });
    if (page < total - 1) nav.push({ text: "➡️", callback_data: cb(view, page + 1) });
    rows.push(nav);
  }
  rows.push([{ text: "🏠 В меню", callback_data: cb("menu") }]);
  return { inline_keyboard: rows };
}

// Собирает {text, keyboard} для любого экрана.
async function renderView(view, page) {
  if (view === "menu") {
    const d = await fetchJson("digest.json");
    const text = d
      ? `📰 <b>Дайджест арбитража — ${d.date}</b>\nВыбери раздел:`
      : "Пока нет выпусков — загляни после утреннего дайджеста.";
    return { text, keyboard: menuKeyboard() };
  }

  if (view === "help") {
    return { text: HELP_TEXT, keyboard: navKeyboard(view, 0, 1) };
  }

  if (view === "arch") {
    const dates = lastDates(7);
    const rows = [];
    for (let i = 0; i < dates.length; i += 2) {
      const row = [{ text: `🗄 ${dates[i]}`, callback_data: cb(`a:${dates[i]}`) }];
      if (dates[i + 1]) row.push({ text: `🗄 ${dates[i + 1]}`, callback_data: cb(`a:${dates[i + 1]}`) });
      rows.push(row);
    }
    return { text: "🗄 <b>Архив</b> — выбери дату:", keyboard: navKeyboard(view, 0, 1, rows) };
  }

  let full = null;
  if (view === "wk") {
    const w = await fetchJson("digest-weekly.json");
    full = w
      ? `📊 <b>Итоги недели — ${w.date}</b>\n\n` + joinSections(w, WEEKLY_TITLES)
      : "Итогов недели пока нет — отчёт выходит по субботам.";
  } else if (view.startsWith("a:")) {
    const d = await fetchJson(`archive/${view.slice(2)}.json`);
    full = d
      ? `🗄 <b>Выпуск за ${d.date}</b>\n\n` + (joinSections(d, SECTION_TITLES) || "Пусто.")
      : `За ${view.slice(2)} выпуска нет (выходной или до запуска архива).`;
  } else if (view === "full" || view.startsWith("s:")) {
    const d = await fetchJson("digest.json");
    if (!d) full = "Пока нет выпусков.";
    else if (view === "full") full = joinSections(d, SECTION_TITLES) || "Выпуск пуст.";
    else {
      const key = view.slice(2);
      full = d.sections?.[key] || `${SECTION_TITLES[key] || key}: в этом выпуске раздел пуст.`;
    }
  } else {
    full = "Неизвестный экран. Жми 🏠 В меню.";
  }

  const chunks = splitText(full);
  const p = Math.min(page, chunks.length - 1);
  return { text: chunks[p], keyboard: navKeyboard(view, p, chunks.length) };
}

async function showView(env, chatId, messageId, view, page) {
  const { text, keyboard } = await renderView(view, page);
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: keyboard,
  };
  if (messageId) {
    const r = await tg(env, "editMessageText", { ...payload, message_id: messageId });
    if (r.ok || (r.description || "").includes("not modified")) return;
  }
  await tg(env, "sendMessage", payload);
}

async function registerCommands(env) {
  const flag = await env.DIGEST.get("cmds_v3");
  if (flag) return;
  await tg(env, "setMyCommands", {
    commands: [
      { command: "menu", description: "📰 Меню разделов дайджеста" },
      { command: "weekly", description: "📊 Итоги недели" },
      { command: "archive", description: "🗄 Архив выпусков" },
      { command: "help", description: "ℹ️ Возможности бота" },
    ],
  });
  await tg(env, "setChatMenuButton", { menu_button: { type: "commands" } });
  await env.DIGEST.put("cmds_v3", "1");
}

async function handleWebhook(request, env) {
  if (request.headers.get("x-telegram-bot-api-secret-token") !== env.WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const update = await request.json();

  if (update.message?.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text.trim().toLowerCase();
    if (text === "/start" || text === "/menu" || text === "меню") await showView(env, chatId, null, "menu", 0);
    else if (text === "/help") await showView(env, chatId, null, "help", 0);
    else if (text === "/weekly") await showView(env, chatId, null, "wk", 0);
    else if (text === "/archive") await showView(env, chatId, null, "arch", 0);
    else await tg(env, "sendMessage", { chat_id: chatId, text: "Жми /menu — там всё." });
  } else if (update.callback_query) {
    const cq = update.callback_query;
    await tg(env, "answerCallbackQuery", { callback_query_id: cq.id });
    const parts = (cq.data || "").split("|");
    if (parts[0] === "v" && parts[1] && parts[1] !== "noop") {
      await showView(env, cq.message.chat.id, cq.message.message_id, parts[1], parseInt(parts[2] || "0", 10));
    }
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
    await registerCommands(env);

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

    const w = await fetchJson("digest-weekly.json");
    if (w?.date) {
      const lastW = await env.DIGEST.get("notified_weekly");
      if (w.date !== lastW) {
        await env.DIGEST.put("notified_weekly", w.date);
        await tg(env, "sendMessage", {
          chat_id: env.CHAT_ID,
          text: `📊 <b>Итоги недели — ${w.date}</b>\nОтчёт готов — жми кнопку:`,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: "📊 Читать итоги недели", callback_data: cb("wk") }]] },
        });
      }
    }
  },
};
