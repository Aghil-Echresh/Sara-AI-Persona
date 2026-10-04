const crypto = require("node:crypto");

const OWNER = process.env.GITHUB_OWNER || "Aghil-Echresh";
const REPO = process.env.GITHUB_REPO || "Sara-AI-Persona";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const MEMORY_PATH = "memory/memory.json";
const COMMANDS_PATH = "memory/commands.json";
const API_KEY = process.env.MEMORY_API_KEY;

function json(res, status, body) {
  res.status(status).json(body);
}

function normalize(value = "") {
  return value
    .trim()
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function githubHeaders() {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is not configured");
  }

  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Sara-Memory-Engine"
  };
}

async function githubGet(path) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${encodeURIComponent(BRANCH)}`;
  const response = await fetch(url, { headers: githubHeaders() });

  if (!response.ok) {
    throw new Error(`GitHub GET failed: ${response.status}`);
  }

  return response.json();
}

async function readJsonFile(path) {
  const file = await githubGet(path);
  const content = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8");
  return { data: JSON.parse(content), sha: file.sha };
}

async function writeJsonFile(path, data, sha, message) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
  const content = Buffer.from(JSON.stringify(data, null, 2) + "\n", "utf8").toString("base64");

  const response = await fetch(url, {
    method: "PUT",
    headers: { ...githubHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ message, content, sha, branch: BRANCH })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub PUT failed: ${response.status} ${detail.slice(0, 300)}`);
  }

  return response.json();
}

function getRememberTriggers(commands) {
  return Array.isArray(commands?.remember_triggers)
    ? commands.remember_triggers.map(normalize).filter(Boolean)
    : ["به خاطر بسپار", "یادت باشه", "این رو ثبت کن", "این رو به حافظه اضافه کن", "یادت بمونه"];
}

function getForgetTriggers(commands) {
  return Array.isArray(commands?.forget_triggers)
    ? commands.forget_triggers.map(normalize).filter(Boolean)
    : ["فراموشش کن", "از حافظه حذفش کن", "یادم نباشه", "این رو پاک کن"];
}

function extractCommand(message, commands) {
  const normalized = normalize(message);

  for (const trigger of getRememberTriggers(commands).sort((a, b) => b.length - a.length)) {
    if (normalized === trigger || normalized.startsWith(trigger + " ")) {
      return { action: "remember", fact: message.trim().slice(trigger.length).trim() };
    }
  }

  for (const trigger of getForgetTriggers(commands).sort((a, b) => b.length - a.length)) {
    if (normalized === trigger || normalized.startsWith(trigger + " ")) {
      return { action: "forget", fact: message.trim().slice(trigger.length).trim() };
    }
  }

  return null;
}

function stableId(fact) {
  return "memory-" + crypto.createHash("sha256").update(normalize(fact)).digest("hex").slice(0, 12);
}

function activeMemories(store) {
  return Array.isArray(store?.memories)
    ? store.memories.filter(memory => memory.active !== false)
    : [];
}

async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  if (!API_KEY) {
    return json(res, 500, { ok: false, error: "MEMORY_API_KEY is not configured" });
  }

  const suppliedKey = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!suppliedKey || suppliedKey !== API_KEY) {
    return json(res, 401, { ok: false, error: "Unauthorized" });
  }

  try {
    const [memoryFile, commandsFile] = await Promise.all([
      readJsonFile(MEMORY_PATH),
      readJsonFile(COMMANDS_PATH)
    ]);

    const store = memoryFile.data;
    const commands = commandsFile.data;

    if (req.method === "GET") {
      return json(res, 200, {
        ok: true,
        memories: activeMemories(store),
        count: activeMemories(store).length
      });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const action = body.action || null;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const requestedFact = typeof body.fact === "string" ? body.fact.trim() : "";

    let resolvedAction = action;
    let fact = requestedFact;

    if (!resolvedAction && message) {
      const parsed = extractCommand(message, commands);
      if (!parsed) {
        return json(res, 400, {
          ok: false,
          error: "No memory command detected",
          supported_commands: {
            remember: getRememberTriggers(commands),
            forget: getForgetTriggers(commands)
          }
        });
      }
      resolvedAction = parsed.action;
      fact = parsed.fact;
    }

    if (!["remember", "forget"].includes(resolvedAction)) {
      return json(res, 400, { ok: false, error: "action must be remember or forget" });
    }

    if (!fact) {
      return json(res, 400, { ok: false, error: "fact is required" });
    }

    if (!Array.isArray(store.memories)) store.memories = [];

    const now = new Date().toISOString();
    const id = stableId(fact);
    const index = store.memories.findIndex(memory => normalize(memory.fact) === normalize(fact));

    if (resolvedAction === "remember") {
      const category = typeof body.category === "string" && body.category.trim()
        ? body.category.trim()
        : "context";

      const record = {
        id,
        fact,
        category,
        source: "user",
        confidence: "explicit",
        created_at: index >= 0 && store.memories[index].created_at
          ? store.memories[index].created_at
          : now,
        updated_at: now,
        user_confirmed: true,
        active: true
      };

      if (index >= 0) {
        store.memories[index] = { ...store.memories[index], ...record };
      } else {
        store.memories.push(record);
      }

      store.last_updated = now;

      const commit = await writeJsonFile(
        MEMORY_PATH,
        store,
        memoryFile.sha,
        `memory: remember "${fact.slice(0, 60)}"`
      );

      return json(res, 200, {
        ok: true,
        action: "remember",
        status: index >= 0 ? "updated" : "created",
        memory: record,
        commit: commit.commit?.sha || null
      });
    }

    if (index < 0) {
      return json(res, 404, { ok: false, action: "forget", status: "not_found", fact });
    }

    store.memories[index] = {
      ...store.memories[index],
      active: false,
      updated_at: now
    };
    store.last_updated = now;

    const commit = await writeJsonFile(
      MEMORY_PATH,
      store,
      memoryFile.sha,
      `memory: forget "${fact.slice(0, 60)}"`
    );

    return json(res, 200, {
      ok: true,
      action: "forget",
      status: "deactivated",
      memory: store.memories[index],
      commit: commit.commit?.sha || null
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, { ok: false, error: error.message || "Internal server error" });
  }
}

module.exports = handler;
