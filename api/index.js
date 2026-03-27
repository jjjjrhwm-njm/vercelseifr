export default async function handler(req, res) {
  const TELEGRAM_URL = 'https://t.me/s/nejm_njm';
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const urlParts = req.url.split('?')[0].split('/').filter(Boolean);
  if (urlParts.length < 2) {
    return res.status(200).send("<h1>Najm Engine v16 Active 🚀</h1><p>Platform is running perfectly.</p>");
  }

  const targetUid = decodeURIComponent(urlParts[0]).toLowerCase().trim();
  const targetPid = decodeURIComponent(urlParts[1]).trim();

  // الدالة الكاسحة: تدمر أي HTML وتستخرج الـ JSON الصافي
  function extractNajmPayloads(rawHtml) {
    // 1. مسح جميع وسوم HTML بالكامل (دمج النصوص التي مزقها تليجرام)
    let text = rawHtml.replace(/<[^>]+>/g, ' ');
    // 2. فك تشفير الرموز
    text = text.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
    // 3. مسح المسافات الوهمية
    text = text.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ');

    const results = [];
    const regex = /===NAJM_V16_START===\s*(.*?)\s*===NAJM_V16_END===/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      try {
        let b64 = match[1].replace(/\s/g, ''); // تنظيف Base64 من أي مسافات
        let decoded = decodeURIComponent(escape(Buffer.from(b64, 'base64').toString('binary')));
        results.push(JSON.parse(decoded));
      } catch(e) {
        console.error('Failed to parse a payload block');
      }
    }
    return results;
  }

  try {
    let targetProject = null;
    let currentBeforeId = null;
    let maxPages = 20; // يبحث في 20 صفحة متتالية في تليجرام

    for (let i = 0; i < maxPages; i++) {
      let fetchUrl = TELEGRAM_URL;
      if (currentBeforeId) fetchUrl += `?before=${currentBeforeId}`;
      
      const html = await fetch(fetchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.text());
      
      const payloads = extractNajmPayloads(html);
      
      // البحث عن المشروع المطلوب (نأخذ الأحدث لأننا نمسح من الجديد للقديم)
      for (const p of payloads) {
        if (p.uid === targetUid && p.pid === targetPid) {
          if (!targetProject || p.timestamp > targetProject.timestamp) {
            targetProject = p;
          }
        }
      }

      if (targetProject) break; // وجدنا المشروع، نوقف البحث

      // استخراج رقم آخر رسالة للانتقال للصفحة السابقة
      const postMatches = [...html.matchAll(/data-post="nejm_njm\/(\d+)"/g)];
      if (postMatches.length > 0) {
        currentBeforeId = Math.min(...postMatches.map(m => parseInt(m[1])));
      } else {
        break; // وصلنا لآخر القناة
      }
    }

    if (!targetProject) {
      return res.status(404).send(`
        <div style="font-family:sans-serif; text-align:center; padding:50px; color:#ff3366; background:#0f1020; height:100vh;">
            <h1>Project Not Found / المشروع غير موجود</h1>
            <p>تأكد من المعرف (${targetUid}) واسم المشروع (${targetPid})</p>
        </div>
      `);
    }

    // تجهيز بيئة التشغيل
    const cleanCode = targetProject.code || '';
    const secrets = targetProject.vars || {};
    const fullUrl = 'https://' + req.headers.host + req.url;
    const webReq = { url: fullUrl, method: req.method, headers: req.headers, json: async () => req.body };

    const execute = new Function('env', 'project', 'request', 'Response', 'fetch', "return (async () => { " + cleanCode + " })();");
    const result = await execute(secrets, { user_id: targetUid, name: targetPid }, webReq, Response, fetch);
    
    if (result instanceof Response) {
      const text = await result.text();
      result.headers.forEach((v, k) => res.setHeader(k, v));
      return res.status(result.status).send(text);
    }
    
    return res.status(200).send(result || "Executed Successfully");

  } catch (e) {
    console.error('Vercel Runner Error:', e);
    return res.status(500).send("<h2>خطأ في المحرك: " + e.message + "</h2>");
  }
}
