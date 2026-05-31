import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Initialize Google Gemini AI clients
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
  try {
    ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  } catch (err) {
    console.error("Failed to initialize GoogleGenAI:", err);
  }
}

app.use(express.json());

// ----------------------------------------------------
// AI SMART SEARCH & CHAT ENDPOINT
// ----------------------------------------------------
app.post("/api/ai", async (req, res) => {
  const { query, history, language } = req.body;

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  // System instructions optimized for language and format
  const sysInstructions = `You are "Klaus", a friendly, ultra-smart AI search assistant embedded directly inside the "Klaus Browser".
Your goal is to answer the user's searches, coding requests, recipes, or facts concisely but comprehensively.
- Answer in the user's language (the request dialect is: ${language || 'en'}).
- Use clean, well-formatted Markdown. Use tables, bold headers, code snippets, and ordered lists where appropriate to make the answer highly human-readable and modern.
- DO NOT use flowery language, or system metadata in your response.
- Provide a helpful, constructive, and objective overview.
- At the end of your response, output exactly 3 smart follow-up questions in a clean block starting with [SUGGESTED_QUESTIONS] followed by one question per line. Contoh:
[SUGGESTED_QUESTIONS]
Question 1?
Question 2?
Question 3?`;

  try {
    if (!ai) {
      // Offline fallback when no valid API key is available
      const localAnswers: Record<string, string> = {
        ru: "Клаус Браузер запущен в демонстрационном режиме без API ключа Gemini. Пожалуйста, добавьте `GEMINI_API_KEY` в Secrets панели настроек AI Studio, чтобы включить полноценный Умный Поиск.\n\n### Локальный ответ:\nВы спросили: **\"" + query + "\"**\n\n- Умный поиск Клауса умеет автоматически распознавать ссылки и выполнять поиск по всему интернету.\n- Клаус возвращает структурированный ответ и цитирует верифицированные источники.\n\n[SUGGESTED_QUESTIONS]\nКак настроить GEMINI_API_KEY?\nКакие функции есть в Клаусе?\nПопробуй открыть google.com через адресную строку!",
        en: "Klaus Browser is running in simulation mode because your GEMINI_API_KEY is not configured yet. Please set your `GEMINI_API_KEY` in the Secrets sub-tab of the AI Studio settings to enable Live AI-Grounded Search.\n\n### Simulation Mode Response:\nYou asked: **\"" + query + "\"**\n\n- Klaus can distinguish between deep queries and URLs.\n- Powered by Gemini 3.5, Klaus delivers structured insights with citations.\n\n[SUGGESTED_QUESTIONS]\nHow to configure my GEMINI_API_KEY?\nShow me more browser features.\nTry typing google.com in the bar!",
        de: "Der Klaus-Browser läuft im Simulationsmodus ohne konfigurierten GEMINI_API_KEY. Bitte geben Sie Ihren API-Schlüssel in den AI-Studio-Einstellungen ein.\n\n### Lokale Antwort:\nIhre Frage: **\"" + query + "\"**\n\n[SUGGESTED_QUESTIONS]\nWie richte ich den GEMINI_API_KEY ein?\nWas sind die Hauptfunktionen von Klaus?\nÖffne wikipedia.org",
        fr: "Le navigateur Klaus fonctionne en mode simulation sans clé API. Veuillez renseigner `GEMINI_API_KEY` dans vos Secrets AI Studio.\n\n### Réponse temporaire :\nVotre requête : **\"" + query + "\"**\n\n[SUGGESTED_QUESTIONS]\nComment configurer la clé API ?\nQuelles sont les fonctionnalités de Klaus ?\nNaviguer vers wikipedia.org",
        es: "Klaus Browser está en modo de simulación. Por favor configura tu `GEMINI_API_KEY` en los Secrets de la interfaz de AI Studio.\n\n### Respuesta simulada:\nPreguntaste: **\"" + query + "\"**\n\n[SUGGESTED_QUESTIONS]\n¿Cómo ingreso mi clave GEMINI_API_KEY?\n¿Qué características tiene Klaus?\nIntenta abrir wikipedia.org"
      };

      const selectedLang = (language as 'ru' | 'en' | 'de' | 'fr' | 'es') || 'en';
      const rawText = localAnswers[selectedLang] || localAnswers['en'];

      const parts = rawText.split("[SUGGESTED_QUESTIONS]");
      const answer = parts[0].trim();
      const suggestedQuestions = parts[1]
        ? parts[1].split("\n").map(q => q.trim()).filter(Boolean)
        : ["How to set up API Key?", "Browser overview", "Open a website"];

      return res.json({
        answer,
        groundingLinks: [
          { uri: "https://wikipedia.org", title: "Wikipedia" },
          { uri: "https://github.com", title: "Github" }
        ],
        suggestedQuestions,
        originalQuery: query
      });
    }

    // Build contents thread incorporating simple history
    const contents: any[] = [];
    if (history && Array.isArray(history)) {
      history.forEach((h: { role: string, text: string }) => {
        contents.push({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.text }]
        });
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: `${query} (Search grounding enabled)` }]
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        systemInstruction: sysInstructions,
        tools: [{ googleSearch: {} }],
      },
    });

    const textResult = response.text || "";
    const splitParts = textResult.split("[SUGGESTED_QUESTIONS]");
    const mainAnswer = splitParts[0].trim();
    const suggested = splitParts[1]
      ? splitParts[1].split("\n").map(q => q.trim().replace(/^-\s*/, "").trim()).filter(Boolean)
      : [];

    // Extract citations natively from search grounding metadata
    const groundingLinks: Array<{ uri: string; title: string }> = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks && Array.isArray(chunks)) {
      chunks.forEach((chunk: any) => {
        if (chunk.web && chunk.web.uri) {
          const title = chunk.web.title || "Web Resource";
          // Prevent duplicates
          if (!groundingLinks.some(link => link.uri === chunk.web.uri)) {
            groundingLinks.push({ uri: chunk.web.uri, title });
          }
        }
      });
    }

    // Fallback links if none grounded but links were in text
    if (groundingLinks.length === 0) {
      const urlRegex = /(https?:\/\/[^\s\)]+)/g;
      const matches = textResult.match(urlRegex);
      if (matches) {
        matches.slice(0, 3).forEach((link, idx) => {
          groundingLinks.push({ uri: link, title: `Reference Link ${idx + 1}` });
        });
      }
    }

    res.json({
      answer: mainAnswer,
      groundingLinks,
      suggestedQuestions: suggested.length > 0 ? suggested.slice(0, 4) : ["More about this topic?", "Tell me about security", "Browser documentation"],
      originalQuery: query
    });

  } catch (error: any) {
    console.error("Gemini API Error in smart search:", error);
    res.status(500).json({ error: error.message || "Something went wrong during AI Search" });
  }
});

// ----------------------------------------------------
// WEBPROXY SYSTEM (keeps standard browsing inside app)
// ----------------------------------------------------
app.get("/api/proxy", async (req, res) => {
  let targetUrl = req.query.url as string;

  if (!targetUrl) {
    return res.status(400).send("Parameter 'url' is required.");
  }

  // Ensure protocol
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = "https://" + targetUrl;
  }

  try {
    const parsedTarget = new URL(targetUrl);
    const origin = parsedTarget.origin;

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      },
      signal: AbortSignal.timeout(12000) // 12 second timeout
    });

    if (!response.ok) {
      throw new Error(`External site returned status ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";

    // If it's HTML, rewrite assets and anchors to route through the proxy
    if (contentType.includes("text/html")) {
      const rawHtml = await response.text();

      // Simple URL absolute-izer
      const makeAbsolute = (relativeUrl: string) => {
        try {
          if (!relativeUrl || relativeUrl.startsWith("data:") || relativeUrl.startsWith("javascript:") || relativeUrl.startsWith("#")) {
            return relativeUrl;
          }
          const absolute = new URL(relativeUrl, targetUrl).href;
          return absolute;
        } catch {
          return relativeUrl;
        }
      };

      // Rewrite absolute-izer specifically for asset routes and iframe stays inside
      // Rules:
      // - Rewrite <a href="X"> to href="/api/proxy?url=RESOLVED_X"
      // - Rewrite images/css/scripts src/href attributes to RESOLVED_X (so they fetch directly from destination)
      
      let modifiedHtml = rawHtml;

      // Clean CSPs, frame options, and upgrade-insecure from html meta tags
      modifiedHtml = modifiedHtml.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, "");
      modifiedHtml = modifiedHtml.replace(/<meta[^>]*http-equiv=["']?X-Frame-Options["']?[^>]*>/gi, "");

      // Rewrite src attributes
      const srcRegex = /(src|href|srcset|action)=["']([^"']+)["']/gi;
      modifiedHtml = modifiedHtml.replace(srcRegex, (match, attribute, relativeVal) => {
        const lowerAttr = attribute.toLowerCase();
        const absoluteUrl = makeAbsolute(relativeVal);

        // Standard link navigation. Rewrite anchor tags to go back through the proxy
        if (lowerAttr === 'href' && !relativeVal.endsWith('.css') && !relativeVal.endsWith('.js') && !relativeVal.endsWith('.png') && !relativeVal.endsWith('.jpg') && !relativeVal.endsWith('.svg') && !relativeVal.startsWith('#')) {
          // Check if this link resides inside a tag or similar, we can safely proxy it
          return `href="/api/proxy?url=${encodeURIComponent(absoluteUrl)}"`;
        }

        // For actions inside <form action="...">
        if (lowerAttr === 'action') {
          return `action="/api/proxy?url=${encodeURIComponent(absoluteUrl)}"`;
        }

        // Keep direct asset files intact, just made absolute
        return `${attribute}="${absoluteUrl}"`;
      });

      // Inject Klaus Sandbox Script to override clicks and target="_blank"
      const sandboxCode = `
        <script>
          // Klaus Browser Sandbox Integration
          (function() {
            // Overwrite window.open
            window.open = function(url, target) {
              window.parent.postMessage({ type: 'KLAUS_OPEN_TAB', url: url }, '*');
              return null;
            };

            // Notify parent of actual navigated URL immediately and on page load
            function notifyParentUrl() {
              try {
                var params = new URLSearchParams(window.location.search);
                var realUrl = params.get('url');
                if (realUrl) {
                  window.parent.postMessage({
                    type: 'KLAUS_URL_CHANGED',
                    url: realUrl,
                    title: document.title || realUrl.replace(/^https?:\\/\\/(www\\.)?/, '').split('/')[0]
                  }, '*');
                }
              } catch(e) {}
            }

            notifyParentUrl();
            window.addEventListener('DOMContentLoaded', notifyParentUrl);
            window.addEventListener('load', notifyParentUrl);

            // Intercept form submissions
            document.addEventListener('submit', function(e) {
              var form = e.target;
              var action = form.getAttribute('action');
              if (action && !action.startsWith('/api/proxy')) {
                var absAction = new URL(action, window.location.href).href;
                form.setAttribute('action', '/api/proxy?url=' + encodeURIComponent(absAction));
              }
            });

            // Clean forms target="_blank"
            document.querySelectorAll('form[target="_blank"]').forEach(function(f) {
              f.removeAttribute('target');
            });

            // Setup a click handler to bypass blank targets and rewrite on-the-fly anchors
            document.addEventListener('click', function(e) {
              var anchor = e.target.closest('a');
              if (anchor) {
                var target = anchor.getAttribute('target');
                if (target === '_blank') {
                  anchor.removeAttribute('target');
                }
                var href = anchor.getAttribute('href');
                if (href && !href.startsWith('/api/proxy') && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('javascript:')) {
                  var absUrl = new URL(href, window.location.href).href;
                  anchor.setAttribute('href', '/api/proxy?url=' + encodeURIComponent(absUrl));
                }
              }
            }, true);
          })();
        </script>
      `;

      // Inject before closing </body> or at the very end
      if (modifiedHtml.includes("</body>")) {
        modifiedHtml = modifiedHtml.replace("</body>", `${sandboxCode}</body>`);
      } else {
        modifiedHtml += sandboxCode;
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(modifiedHtml);
    } else {
      // Direct stream for non-HTML assets (CSS, Images, etc.)
      const headersToSet = [
         "content-type", "content-length", "cache-control", "last-modified"
      ];
      headersToSet.forEach(h => {
        const val = response.headers.get(h);
        if (val) res.setHeader(h, val);
      });
      
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    }

  } catch (error: any) {
    console.error("Proxy failure for URL:", targetUrl, error);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(502).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f1f5f9; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; text-align: center; }
          .container { max-width: 500px; border: 1px solid #334155; padding: 30px; border-radius: 12px; background-color: #1e293b; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); }
          h2 { color: #f43f5e; margin-top: 0; font-size: 24px; }
          p { color: #94a3b8; font-size: 15px; line-height: 1.5; margin-bottom: 24px; }
          .url { background: #0f172a; padding: 6px 12px; border-radius: 6px; font-family: monospace; font-size: 13px; color: #38bdf8; word-break: break-all; margin: 12px 0; border: 1px solid #1e293b; }
          .btn { background-color: #3b82f6; color: white; border: none; padding: 10px 20px; font-size: 14px; border-radius: 6px; cursor: pointer; text-decoration: none; display: inline-block; font-weight: 500; }
          .btn:hover { background-color: #2563eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Klaus: Connection Blocked</h2>
          <p>Klaus Browser was unable to load this page directly. The server may be blocking proxy requests or the link is temporarily offline.</p>
          <div class="url">${targetUrl}</div>
          <p style="font-size: 13px; color: #64748b;">Hint: You can use the Klaus "Ask AI" mode in the toolbar to formulate a summary or search insight about this address.</p>
          <button class="btn" onclick="window.parent.postMessage({ type: 'KLAUS_FALLBACK_AI', url: '${targetUrl}' }, '*')">Summarize with Klaus AI</button>
        </div>
      </body>
      </html>
    `);
  }
});

// ----------------------------------------------------
// AI WEBSITE SUMMARIZATION AS FALLBACK
// ----------------------------------------------------
app.get("/api/summarize", async (req, res) => {
  const targetUrl = req.query.url as string;

  if (!targetUrl) {
    return res.status(400).json({ error: "Url parameter is required" });
  }

  if (!ai) {
    return res.json({
      summary: `### No Gemini Key
Klaus is unable to digest the website summarized values because \`GEMINI_API_KEY\` is not yet defined.
Please supply your AI key in Settings to analyze: **${targetUrl}**`
    });
  }

  try {
    const summaryPrompt = `Analyze and provide a professional, executive outline summaries of the website located at: ${targetUrl}.
Since we may be loading the URL from internet grounding, use Google Search to ground your facts about this domain so it matches current realities.
Provide:
- A brief 1-sentence descriptive slogan of this site.
- Its main core services/products.
- A concise explanation of its primary target audience.
Format with lovely typography, rich dividers, and bold outlines. End with a quote about standard internet safety inside the Klaus Browser.`;

    const result = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: summaryPrompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    res.json({ summary: result.text || "No summary was generated." });
  } catch (err: any) {
    console.error("AI summarization failed:", err);
    res.status(500).json({ error: err.message || "Failed to digest page with AI" });
  }
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
