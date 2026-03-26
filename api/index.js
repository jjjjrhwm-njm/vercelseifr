export default async function handler(req, res) {
  const TELEGRAM_URL = 'https://t.me/s/nejm_njm';
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const urlParts = req.url.split('?')[0].split('/').filter(Boolean);
  if (urlParts.length < 2) return res.status(200).send("<h1>Najm Engine v7.0 Ready 🚀</h1>");

  const userId = decodeURIComponent(urlParts[0]);
  const projName = decodeURIComponent(urlParts[1]);

  try {
    const html = await fetch(TELEGRAM_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.text());
    const messages = html.split('<div class="tgme_widget_message_text').reverse();
    let targetMessage = null;

    for (let msg of messages) {
      if (msg.includes('---METADATA---')) {
        const metaMatch = msg.match(/---METADATA---({[\s\S]*?})---METADATA---/);
        if (metaMatch) {
          const meta = JSON.parse(decodeHtml(metaMatch[1]));
          if (meta.uid === userId && meta.pid === projName) {
            targetMessage = msg;
            break;
          }
        }
      }
    }

    if (!targetMessage) return res.status(404).send("<h1>Project Not Found</h1>");

    const codeMatch = targetMessage.match(/\[START_CODE\]([\s\S]*?)\[END_CODE\]/);
    const varsMatch = targetMessage.match(/\[START_VARS\]([\s\S]*?)\[END_VARS\]/);
    
    if (!codeMatch) throw new Error("لم يتم العثور على منطقة الكود");

    // تنظيف الكود والأسرار باستخدام المنظف المطور
    const cleanCode = decodeHtml(codeMatch[1]).trim();
    const secrets = varsMatch ? JSON.parse(decodeHtml(varsMatch[1]).trim()) : {};

    const fullUrl = 'https://' + req.headers.host + req.url;
    const webReq = {
        url: fullUrl,
        method: req.method,
        headers: req.headers,
        json: async () => req.body
    };

    const execute = new Function('env', 'project', 'request', 'Response', 'fetch', "return (async () => { " + cleanCode + " })();");
    const result = await execute(secrets, { user_id: userId, name: projName }, webReq, Response, fetch);
    
    if (result instanceof Response) {
        const text = await result.text();
        result.headers.forEach((v, k) => res.setHeader(k, v));
        return res.status(result.status).send(text);
    }
    return res.status(200).send(result || "Executed");

  } catch (e) {
    return res.status(500).send("<h2>خطأ المحرك: " + e.message + "</h2>");
  }
}

// 🧼 وظيفة تنظيف HTML المطورة للتعامل مع رموز تليجرام الغريبة
function decodeHtml(h) {
  const entities = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
    '&#33;': '!', '&#039;': "'", '&#92;': '\\', '&nbsp;': ' ', '&#092;': '\\'
  };
  return h.replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]*>/g, '')
          .replace(/&[#0-9a-z]+;/gi, (entity) => entities[entity] || entity);
}
