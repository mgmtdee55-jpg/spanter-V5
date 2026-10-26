const { ActivityType } = require("discord.js");
const { embed } = require("./vouch/ui");

const DEFAULT_REPO = "mgmtdee55-jpg/spanter-V5";

function localVersion() {
  return require("./package.json").version;
}

function repoSlug() {
  return process.env.GITHUB_REPO || DEFAULT_REPO;
}

function numeric(version) {
  return String(version || "")
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(left, right) {
  const a = numeric(left);
  const b = numeric(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0);
    if (delta) return delta;
  }
  return 0;
}

function releaseUrl(tag) {
  return `https://github.com/${repoSlug()}/releases/tag/${encodeURIComponent(tag)}`;
}

async function latestRelease(fetcher = fetch) {
  const response = await fetcher(`https://api.github.com/repos/${repoSlug()}/releases/latest`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "numb-bot"
    },
    signal: AbortSignal.timeout(8000)
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const error = new Error(`GitHub releases ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const body = await response.json();
  const tag = String(body.tag_name || body.name || "").trim();
  if (!tag) return null;
  return {
    tag,
    name: body.name || tag,
    url: body.html_url || releaseUrl(tag),
    notes: String(body.body || "").trim()
  };
}

async function updateStatus(fetcher = fetch) {
  const current = localVersion();
  const latest = await latestRelease(fetcher);
  return {
    current,
    latest,
    available: !!(latest && compareVersions(latest.tag, current) > 0)
  };
}

function statusText(status) {
  if (!status.latest) {
    return `This bot is **${status.current}**. GitHub does not have a release to compare yet.`;
  }
  if (status.available) {
    return [
      `**Update available:** ${status.latest.tag}`,
      `Running **${status.current}**.`,
      status.latest.url
    ].join("\n");
  }
  return `This bot is **${status.current}**, which matches GitHub (${status.latest.tag}).`;
}

async function applyPresence(client, status) {
  if (!client?.user || typeof client.user.setPresence !== "function") return;
  if (!status.available) return;
  await client.user.setPresence({
    activities: [{ name: "Update available", type: ActivityType.Watching }]
  });
}

async function refresh(client, fetcher = fetch) {
  const status = await module.exports.updateStatus(fetcher);
  await applyPresence(client, status);
  if (status.available) {
    console.log(`[update] ${status.latest.tag} is available (${status.latest.url})`);
  }
  return status;
}

async function handleCommand(message, args, prefix) {
  const head = String(args[0] || "").toLowerCase();
  const name = head.startsWith(String(prefix).toLowerCase()) ? head.slice(prefix.length) : head;
  if (name !== "update") return false;
  try {
    const status = await module.exports.updateStatus();
    await applyPresence(message.client, status);
    const title = status.available ? "Update Available" : "Bot Version";
    await message.reply({ embeds: [embed(title, statusText(status), { guild: message.guild })] });
  } catch (error) {
    console.error("[update]", error);
    await message.reply({
      embeds: [embed("Update Check Failed", "GitHub releases could not be read. Try again in a moment.", { guild: message.guild })]
    });
  }
  return true;
}

module.exports = {
  DEFAULT_REPO,
  applyPresence,
  compareVersions,
  handleCommand,
  latestRelease,
  localVersion,
  refresh,
  repoSlug,
  statusText,
  updateStatus
};
