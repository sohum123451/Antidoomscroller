/**
 * Minimal Turso client over the /v2/pipeline HTTP API.
 * No npm dependencies, so the Worker deploys with nothing to install.
 */

function toArg(v) {
  if (v === null || v === undefined) return { type: "null", value: null };
  if (typeof v === "number") {
    return Number.isInteger(v)
      ? { type: "integer", value: String(v) }
      : { type: "float", value: v };
  }
  if (typeof v === "boolean") return { type: "integer", value: v ? "1" : "0" };
  return { type: "text", value: String(v) };
}

function fromValue(cell) {
  if (!cell || cell.type === "null") return null;
  if (cell.type === "integer") return Number(cell.value);
  if (cell.type === "float") return cell.value;
  return cell.value;
}

export class Turso {
  constructor(url, token) {
    // Accept libsql://name-org.turso.io and rewrite to https://
    this.endpoint = url.replace(/^libsql:\/\//, "https://").replace(/\/+$/, "") + "/v2/pipeline";
    this.token = token;
  }

  /** Run one or more statements in a single round trip. */
  async batch(statements) {
    const requests = statements.map(([sql, args = []]) => ({
      type: "execute",
      stmt: { sql, args: args.map(toArg) }
    }));
    requests.push({ type: "close" });

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ requests })
    });

    if (!res.ok) {
      throw new Error(`Turso HTTP ${res.status}: ${await res.text()}`);
    }

    const body = await res.json();
    return body.results.slice(0, statements.length).map((r) => {
      if (r.type === "error") {
        throw new Error(`Turso SQL error: ${r.error?.message || "unknown"}`);
      }
      const result = r.response.result;
      const cols = result.cols.map((c) => c.name);
      return {
        rows: result.rows.map((row) => {
          const o = {};
          row.forEach((cell, i) => (o[cols[i]] = fromValue(cell)));
          return o;
        }),
        rowsAffected: result.affected_row_count,
        lastInsertRowid: result.last_insert_rowid ? Number(result.last_insert_rowid) : null
      };
    });
  }

  async query(sql, args = []) {
    const [r] = await this.batch([[sql, args]]);
    return r.rows;
  }

  async one(sql, args = []) {
    const rows = await this.query(sql, args);
    return rows[0] || null;
  }

  async run(sql, args = []) {
    const [r] = await this.batch([[sql, args]]);
    return r;
  }
}
