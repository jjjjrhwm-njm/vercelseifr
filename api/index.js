export default async function handler(req, res) {
  const TELEGRAM_URL = 'https://t.me/s/nejm_njm';
  
  // إعدادات السماح للوحة التحكم بالاتصال
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // استخراج اسم المطور واسم المشروع من الرابط
  const urlParts = req.url.split('?')[0].split('/').filter(Boolean);
  
  if (urlParts.length < 2) {
      return res.status(200).send("<body style='background:#0f1020; color:#00d2ff; text-align:center; padding:50px; font-family:monospace;'><h1>🚀 محرك نجم Vercel يعمل بنجاح!</h1></body>");
  }

  const userId = decodeURIComponent(urlParts[0]);
  const projName = decodeURIComponent(urlParts[1]);

  try {
    // جلب الأكواد من تليجرام
    const fetchRes = await fetch(TELEGRAM_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await fetchRes.text();
    const messages = html.split('<div class="tgme_widget_message_text').reverse();
    let targetMessage = null;

    for (let msg of messages) {
      if (msg.includes('---METADATA---')) {
        const metaMatch = msg.match(/---METADATA---({[\s\S]*?})---METADATA---/);
        if (metaMatch) {
          try {
            const meta = JSON.parse(decodeHtml(metaMatch[1]));
            if (meta.uid === userId && meta.pid === projName) {
              targetMessage = msg;
              break;
            }
          } catch(e) {}
        }
      }
    }

    if (!targetMessage) {
        return res.status(404).send(`<body style='background:#0f1020; color:#ff3366; text-align:center; padding:50px; font-family:monospace;'><h1>❌ المشروع [${projName}] غير موجود</h1></body>`);
    }

    const codeMatch = targetMessage.match(/<code>([\s\S]*?)<\/code>/);
    const varsMatch = targetMessage.match(/🔐 <b>Secrets:<\/b>[\s\S]*?<code>([\s\S]*?)<\/code>/);
    
    if (!codeMatch) throw new Error("لم يتم العثور على كود صالح");

    const cleanCode = decodeHtml(codeMatch[1]);
    let secrets = {};
    if (varsMatch) {
        try { secrets = JSON.parse(decodeHtml(varsMatch[1])); } catch(e) {}
    }

    // تحويل طلب Vercel إلى طلب قياسي ليتوافق مع كود البوت الخاص بك
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const fullUrl = `${protocol}://${req.headers.host}${req.url}`;
    const webReq = new Request(fullUrl, {
        method: req.method,
        headers: req.headers,
        body: req.method === 'POST' ? JSON.stringify(req.body) : undefined
    });

    // تشغيل الكود في Vercel (مسموح هنا بـ new Function)
    const execute = new Function('env', 'project', 'request', 'Response', 'fetch', `return (async () => { \n${cleanCode}\n })();`);
    const result = await execute(secrets, { user_id: userId, name: projName }, webReq, Response, fetch);
    
    // إرجاع النتيجة للبوت أو المتصفح
    if (result instanceof Response) {
        const text = await result.text();
        result.headers.forEach((v, k) => res.setHeader(k, v));
        return res.status(result.status).send(text);
    }
    
    return res.status(200).send(result || "تم التنفيذ");

  } catch (e) {
    return res.status(500).send(`<body style='background:#0f1020; color:#ffaa00; text-align:center; padding:50px; font-family:monospace;'><h2>⚠️ خطأ في المحرك: ${e.message}</h2></body>`);
  }
}

function decodeHtml(h) {
  return h.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
