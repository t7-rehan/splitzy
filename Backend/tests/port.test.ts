/**
 * Unit tests for the port authority (src/config/port.ts) — the connection-
 * failure fix. Regression rule: an ambient process-scope PORT (e.g. PORT=0
 * inherited from a parent shell) must NEVER override the project's own
 * Backend/.env PORT, and everything resolves to exactly one predictable port.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  envFilePortValue,
  parsePortValue,
  resolvePort,
} from "../src/config/port.js";

function withTempEnvFile(content: string | null) {
  const dir = mkdtempSync(join(tmpdir(), "splitzy-port-"));
  const file = join(dir, ".env");
  if (content !== null) writeFileSync(file, content, "utf8");
  return {
    file,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe("parsePortValue", () => {
  it("maps absent/blank values to null (no port configured)", () => {
    assert.equal(parsePortValue(undefined), null);
    assert.equal(parsePortValue(""), null);
    assert.equal(parsePortValue("   "), null);
  });

  it("accepts 0 explicitly (OS-assigned port is a valid deliberate choice)", () => {
    assert.equal(parsePortValue("0"), 0);
  });

  it("parses normal ports", () => {
    assert.equal(parsePortValue("5000"), 5000);
    assert.equal(parsePortValue("8080"), 8080);
  });

  it("throws a descriptive error on garbage/out-of-range values", () => {
    assert.throws(() => parsePortValue("http"), /Invalid PORT/);
    assert.throws(() => parsePortValue("99999"), /Invalid PORT/);
    assert.throws(() => parsePortValue("-1"), /Invalid PORT/);
    assert.throws(() => parsePortValue("12.5"), /Invalid PORT/);
  });
});

describe("envFilePortValue", () => {
  it("reads the PORT line from a .env file", () => {
    const { file, cleanup } = withTempEnvFile(
      "# comment\nNODE_ENV=development\nPORT=5432\n",
    );
    try {
      assert.equal(envFilePortValue(file), "5432");
    } finally {
      cleanup();
    }
  });

  it("handles quoted values and ignores other keys", () => {
    const { file, cleanup } = withTempEnvFile('CORS_ORIGIN="a,b"\nPORT = "6553" \n');
    try {
      assert.equal(envFilePortValue(file), "6553");
    } finally {
      cleanup();
    }
  });

  it("returns undefined when the file has no PORT entry", () => {
    const { file, cleanup } = withTempEnvFile("NODE_ENV=development\n");
    try {
      assert.equal(envFilePortValue(file), undefined);
    } finally {
      cleanup();
    }
  });

  it("returns undefined for a missing file (no throw)", () => {
    assert.equal(envFilePortValue(join(tmpdir(), "definitely-missing.env")), undefined);
  });
});

describe("resolvePort", () => {
  it("Backend/.env PORT wins over an ambient process PORT (the root-cause rule)", () => {
    const { file, cleanup } = withTempEnvFile("PORT=5432\n");
    try {
      const port = resolvePort([], { PORT: "0", SPLITZY_ENV_FILE: file });
      assert.equal(port, 5432);
    } finally {
      cleanup();
    }
  });

  it("falls back to ambient PORT when the .env has no PORT entry", () => {
    const { file, cleanup } = withTempEnvFile("NODE_ENV=development\n");
    try {
      const port = resolvePort([], { PORT: "8080", SPLITZY_ENV_FILE: file });
      assert.equal(port, 8080);
    } finally {
      cleanup();
    }
  });

  it("falls back to ambient PORT when there is no .env at all", () => {
    const port = resolvePort([], {
      PORT: "8080",
      SPLITZY_ENV_FILE: join(tmpdir(), "definitely-missing.env"),
    });
    assert.equal(port, 8080);
  });

  it("defaults to 5000 (the frontend default VITE_API_BASE_URL port)", () => {
    const port = resolvePort([], {
      SPLITZY_ENV_FILE: join(tmpdir(), "definitely-missing.env"),
    });
    assert.equal(port, 5000);
  });

  it("an explicit --port flag wins over everything", () => {
    const { file, cleanup } = withTempEnvFile("PORT=5432\n");
    try {
      assert.equal(
        resolvePort(["node", "server.ts", "--port", "7777"], { PORT: "0", SPLITZY_ENV_FILE: file }),
        7777,
      );
      assert.equal(
        resolvePort(["node", "server.ts", "--port=8888"], { SPLITZY_ENV_FILE: file }),
        8888,
      );
    } finally {
      cleanup();
    }
  });

  it("fails fast on an invalid .env PORT instead of binding somewhere random", () => {
    const { file, cleanup } = withTempEnvFile("PORT=not-a-port\n");
    try {
      assert.throws(() => resolvePort([], { SPLITZY_ENV_FILE: file }), /Invalid PORT/);
    } finally {
      cleanup();
    }
  });
});
