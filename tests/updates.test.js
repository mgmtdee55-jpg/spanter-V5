const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("path");
const test = require("node:test");
const { ActivityType } = require("discord.js");

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "spanter-updates-"));
process.env.DB_PATH = path.join(scratch, "vc.sqlite");
process.env.GITHUB_REPO = "mgmtdee55-jpg/spanter-V5";

const updates = require("../updates");
const extras = require("../extras");

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      return body;
    }
  };
}

test("local version matches package.json", () => {
  assert.equal(updates.localVersion(), require("../package.json").version);
  assert.equal(updates.repoSlug(), "mgmtdee55-jpg/spanter-V5");
});

test("a newer GitHub release is an available update", async () => {
  const current = updates.localVersion();
  const [major, minor, patch] = current.split(".").map(Number);
  const newer = `${major}.${minor}.${patch + 1}`;
  const status = await updates.updateStatus(async () => jsonResponse(200, {
    tag_name: `v${newer}`,
    name: `v${newer}`,
    html_url: `https://github.com/mgmtdee55-jpg/spanter-V5/releases/tag/v${newer}`,
    body: "Join to create no longer lets people sit in the lobby."
  }));
  assert.equal(status.available, true);
  assert.equal(status.current, current);
  assert.equal(status.latest.tag, `v${newer}`);
  assert.match(updates.statusText(status), /Update available/);
});

test("matching GitHub release is not advertised as available", async () => {
  const current = updates.localVersion();
  const status = await updates.updateStatus(async () => jsonResponse(200, {
    tag_name: `v${current}`,
    html_url: `https://github.com/mgmtdee55-jpg/spanter-V5/releases/tag/v${current}`
  }));
  assert.equal(status.available, false);
  assert.match(updates.statusText(status), /matches GitHub/);
});

test("presence is Update available only when GitHub is ahead", async () => {
  const activities = [];
  const client = {
    user: {
      async setPresence(payload) {
        activities.push(payload);
      }
    }
  };
  await updates.applyPresence(client, { available: false });
  await updates.applyPresence(client, {
    available: true,
    latest: { tag: "v9.9.9", url: "https://example.test" }
  });
  assert.equal(activities.length, 1);
  assert.equal(activities[0].activities[0].name, "Update available");
  assert.equal(activities[0].activities[0].type, ActivityType.Watching);
});

test("-update reports when a GitHub release is newer", async () => {
  const original = updates.updateStatus;
  updates.updateStatus = async () => ({
    current: "1.0.0",
    available: true,
    latest: {
      tag: "v1.0.1",
      url: "https://github.com/mgmtdee55-jpg/spanter-V5/releases/tag/v1.0.1"
    }
  });
  const message = {
    guild: { id: "guild-1" },
    client: { user: { async setPresence() {} } },
    replies: [],
    async reply(payload) {
      this.replies.push(payload);
      return payload;
    }
  };
  try {
    assert.equal(await extras.handleCommand(message, ["-update"], "-"), true);
    const embed = message.replies[0].embeds[0].data;
    assert.match(String(embed.description), /\*\*Update Available\*\*/);
    assert.match(embed.description, /v1\.0\.1/);
  } finally {
    updates.updateStatus = original;
  }
});
