export default async function handler(req, res) {
  const TELEGRAM_URL = 'https://t.me/s/nejm_njm';
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const urlParts = req.url.split('?')[0].split('/').filter(Boolean);
  if (urlParts.length < 2) {
    return res.status(200).send("<h1>Najm Cloud v15.0 Engine Ready 🚀</h1>");
  }

  const userId = decodeURIComponent(urlParts[0]);
  const projName = decodeURIComponent(urlParts[1]);

  try {
    const html = await fetch(TELEGRAM_URL, { 
      headers: { 'User-Agent': 'Mozilla/5.0' } 
    }).then(r => r.text());
    
    const messages = html.split('<div class="tgme_widget_message_text').reverse();
    let targetMessage = null;

    for (let msg of messages) {
      const bracketIdMatch = msg.match(/\[NAJM_ID:\s*([^\]]+)\]/i);
      const bracketPrjMatch = msg.match(/\[NAJM_PRJ:\s*([^\]]+)\]/i);
      
      if (bracketIdMatch && bracketPrjMatch) {
        const uid = bracketIdMatch[1].trim();
        const pid = bracketPrjMatch[1].trim();
        if (uid === userId && pid === projName) {
          targetMessage = msg;
          break;
        }
      }
    }

    if (!targetMessage) {
      return res.status(404).send("<h1>Project Not Found</h1><p>لم يتم العثور على المشروع</p>");
    }

    const payloadMatch = targetMessage.match(/\[NAJM_PAYLOAD_START\]([\s\S]*?)\[NAJM_PAYLOAD_END\]/i);
    if (!payloadMatch) {
      throw new Error("لم يتم العثور على الحزمة المشفرة");
    }

    const base64Payload = payloadMatch[1].trim();
    const decodedJson = safeBase64Decode(base64Payload);
    if (!decodedJson) {
      throw new Error("فشل فك تشفير Base64");
    }

    const payload = JSON.parse(decodedJson);
    const cleanCode = payload.code || '';
    const secrets = payload.vars || {};

    const fullUrl = 'https://' + req.headers.host + req.url;
    const webReq = {
      url: fullUrl,
      method: req.method,
      headers: req.headers,
      json: async () => req.body
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

function safeBase64Decode(base64Str) {
  try {
    let cleaned = base64Str.trim().replace(/\s/g, '');
    cleaned = decodeHtmlEntities(cleaned);
    const binaryString = atob(cleaned);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
    console.error('Base64 decode error:', e);
    return null;
  }
}

function decodeHtmlEntities(text, maxDepth = 5) {
  if (!text || maxDepth === 0) return text || '';
  let decoded = text;
  const entities = {
    '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"',
    '&#39;': "'", '&#x27;': "'", '&#x2F;': '/', '&#x60;': '`',
    '&apos;': "'", '&nbsp;': ' ', '&#34;': '"', '&#38;': '&',
    '&#60;': '<', '&#62;': '>', '&ldquo;': '"', '&rdquo;': '"'
  };
  
  let changed = false;
  for (const [entity, char] of Object.entries(entities)) {
    if (decoded.includes(entity)) {
      decoded = decoded.replace(new RegExp(entity, 'g'), char);
      changed = true;
    }
  }
  
  if (changed) {
    return decodeHtmlEntities(decoded, maxDepth - 1);
  }
  
  decoded = decoded.replace(/<br\s*\/?>/gi, '\n')
                   .replace(/<[^>]*>/g, '')
                   .replace(/[\u200B-\u200D\uFEFF]/g, '');
  
  return decoded;
}
