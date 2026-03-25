import { fromBuffer } from 'pdf2pic';
import sharp from 'sharp';

export const config = { api: { bodyParser: { sizeLimit: '50mb' } } };

const PAGES_PER_CHUNK = 5;

async function renderPageAsJpeg(pdfBuffer, pageNum) {
  const converter = fromBuffer(pdfBuffer, {
    density: 120,
    format: 'jpeg',
    width: 1200,
    height: 900,
    saveFilename: `page`,
    savePath: '/tmp',
  });
  const result = await converter(pageNum, { responseType: 'buffer' });
  // Compress further with sharp to keep well under API limits
  const compressed = await sharp(result.buffer)
    .jpeg({ quality: 60, mozjpeg: true })
    .toBuffer();
  return compressed.toString('base64');
}

async function getPageCount(pdfBuffer) {
  // Quick parse: count /Type /Page entries
  const text = pdfBuffer.toString('binary');
  const matches = text.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 1;
}

async function callClaude(apiKey, imageBase64Array, fileName, startPage, endPage, totalPages) {
  const prompt = `You are converting pages ${startPage}–${endPage} of ${totalPages} from "${fileName}" into clean LLM-ready markdown.
Return ONLY valid complete JSON, no extra text, no markdown fences:
{"fileName":"${fileName.replace(/\.[^.]+$/, '')}","sections":[{"title":"Section title","slug":"kebab-case-slug","content":"Full markdown content"}]}
Rules:
- Extract all visible text faithfully
- Split into logical sections by headings or topic
- Be concise — summarise repetitive content
- Preserve tables and lists in markdown format
- Never truncate mid-string — response must be complete valid JSON`;

  const imageContent = imageBase64Array.map(b64 => ({
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data: b64 }
  }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{ role: 'user', content: [...imageContent, { type: 'text', text: prompt }] }]
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || response.statusText);
  const raw = data.content.map(c => c.text || '').join('');
  const clean = raw.replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();
  try {
    return JSON.parse(clean);
  } catch(e) {
    const partial = clean.replace(/,?\s*\{[^}]*$/, '').replace(/,?\s*$/, '') + ']}';
    return JSON.parse(partial);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured.' });

  const { pdfBase64, fileName } = req.body;
  if (!pdfBase64 || !fileName) return res.status(400).json({ error: 'Missing pdfBase64 or fileName' });

  try {
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const totalPages = await getPageCount(pdfBuffer);
    const allSections = [];
    const baseName = fileName.replace(/\.[^.]+$/, '');

    for (let start = 1; start <= totalPages; start += PAGES_PER_CHUNK) {
      const end = Math.min(start + PAGES_PER_CHUNK - 1, totalPages);
      const images = [];
      for (let p = start; p <= end; p++) {
        try {
          const jpeg = await renderPageAsJpeg(pdfBuffer, p);
          images.push(jpeg);
        } catch(e) {
          console.error(`Failed to render page ${p}:`, e.message);
        }
      }
      if (images.length === 0) continue;

      const chunkResult = await callClaude(apiKey, images, fileName, start, end, totalPages);
      chunkResult.sections.forEach(s => {
        s.title = `[pp. ${start}–${end}] ${s.title}`;
        s.slug = `pp-${start}-${end}-${s.slug}`;
        allSections.push(s);
      });
    }

    res.status(200).json({ fileName: baseName, sections: allSections });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
