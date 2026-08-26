// Cloudflare Worker: riceve le proposte di canzoni dal form e le aggiunge
// a canzoni-proposte.txt nel repo GitHub, usando un token con permessi
// scritti in modo sicuro come secret (mai nel codice del sito pubblico).

const REPO_OWNER = "VincenzoBarresi";
const REPO_NAME = "Sigaretta";
const FILE_PATH = "canzoni-proposte.txt";
const ALLOWED_ORIGIN = "https://vincenzobarresi.github.io";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    if (request.method !== "POST") {
      return withCors(new Response("Method not allowed", { status: 405 }));
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return withCors(jsonResponse({ ok: false, error: "JSON non valido" }, 400));
    }

    const canzone = sanitize(body.canzone, 200);
    const nome = sanitize(body.nome, 50);

    if (!canzone) {
      return withCors(jsonResponse({ ok: false, error: "Campo canzone mancante" }, 400));
    }

    const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
    const headers = {
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "sigaretta-worker"
    };

    const getRes = await fetch(apiUrl, { headers });

    let existingContent = "";
    let sha;

    if (getRes.status === 200) {
      const data = await getRes.json();
      sha = data.sha;
      existingContent = atob(data.content.replace(/\n/g, ""));
    } else if (getRes.status !== 404) {
      return withCors(jsonResponse({ ok: false, error: "Errore lettura file" }, 502));
    }

    const riga = nome ? `${nome}: ${canzone}` : canzone;
    const separatore = existingContent && !existingContent.endsWith("\n") ? "\n" : "";
    const nuovoContenuto = existingContent + separatore + riga + "\n";

    const putBody = {
      message: `Nuova proposta canzone: ${riga}`,
      content: btoa(unescape(encodeURIComponent(nuovoContenuto))),
      ...(sha ? { sha } : {})
    };

    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(putBody)
    });

    if (!putRes.ok) {
      return withCors(jsonResponse({ ok: false, error: "Errore scrittura repo" }, 502));
    }

    return withCors(jsonResponse({ ok: true }, 200));
  }
};

function sanitize(value, maxLen) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]/g, " ").trim().slice(0, maxLen);
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function withCors(response) {
  const newHeaders = new Headers(response.headers);
  newHeaders.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  newHeaders.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  newHeaders.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, { status: response.status, headers: newHeaders });
}
