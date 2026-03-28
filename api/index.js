export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const urlParts = req.url.split('?')[0].split('/').filter(Boolean);
  if (urlParts.length < 2) {
    return res.status(200).send("<h1>Najm Cloud v17.0 Engine Ready 🚀</h1>");
  }

  const userId = decodeURIComponent(urlParts[0]);
  const projName = decodeURIComponent(urlParts[1]);

  try {
    // جلب الكود من قاعدة بيانات كلودفلير مباشرة
    const apiUrl = `https://najm-backend.60jrhwm.workers.dev/get-code?user_id=${encodeURIComponent(userId)}&project_name=${encodeURIComponent(projName)}`;
    
    // منع الكاش
    const nocache = Date.now() + Math.random();
    const response = await fetch(`${apiUrl}&nocache=${nocache}`, { cache: 'no-store' });
    
    if (!response.ok) {
      return res.status(404).send("<h1>Project Not Found</h1><p>لم يتم العثور على المشروع في قاعدة البيانات</p>");
    }

    const payload = await response.json();
    const cleanCode = payload.code || '';
    const secrets = payload.vars || {};

    const fullUrl = 'https://' + req.headers.host + req.url;
    
    // تأمين الـ Webhook
    const webReq = {
      url: fullUrl,
      method: req.method,
      headers: req.headers,
      json: async () => (typeof req.body === 'string' ? JSON.parse(req.body) : req.body)
    };

    const execute = new Function('env', 'project', 'request', 'Response', 'fetch',
      "return (async () => { " + cleanCode + " })();");

    const result = await execute(secrets, { user_id: userId, name: projName }, webReq, Response, fetch);

    if (result instanceof Response) {
      const text = await result.text();
      result.headers.forEach((v, k) => res.setHeader(k, v));
      return res.status(result.status).send(text);
    }

    return res.status(200).send(result || "Executed Successfully");

  } catch (e) {
    console.error('Runner error:', e);
    return res.status(500).send("<h2>خطأ المحرك: " + e.message + "</h2>");
  }
}
