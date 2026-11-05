import { afterAll, describe, expect, test } from "bun:test";
import { gunzipSync, gzipSync } from "node:zlib";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite-plus";
import {
  acceptableEncodings,
  compressibleResponse,
  staticFileResponse,
} from "../server/compression.ts";
import { assetCompression } from "../scripts/asset-compression.ts";
import { MIN_COMPRESS_BYTES } from "../shared/compression.ts";

/**
 * Transfer-encoding behaviour of the production server and the build that feeds
 * it. These assertions pin the contract a browser and a shared cache depend on:
 * the encoded and identity variants decode to the same bytes, an unacceptable
 * encoding is refused, Range stays decodable, and the build writes only
 * sidecars the server can use.
 */

const scratch = path.join(tmpdir(), `trendifest-compression-${process.pid}`);

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function request(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/", { headers });
}

/** Body bytes of a response, decompressing a gzip representation first. */
async function decodedBody(response: Response): Promise<Uint8Array> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  return response.headers.get("content-encoding") === "gzip" ? gunzipSync(bytes) : bytes;
}

describe("content negotiation", () => {
  const negotiate = (acceptEncoding: string) =>
    acceptableEncodings(request({ "accept-encoding": acceptEncoding }));

  test("quality factors and wildcards select the accepted encodings in order", () => {
    // A bare `*` leaves both encodings available, gzip first.
    expect(negotiate("*")).toEqual(["gzip", "identity"]);
    expect(negotiate("GZIP, deflate, br")).toEqual(["gzip", "identity"]);
    // Explicit q=0 wins over the wildcard, wherever it appears in the header.
    expect(negotiate("gzip;q=0, *")).toEqual(["identity"]);
    expect(negotiate("*;q=0")).toEqual([]);
    // An unsupported token on its own leaves identity acceptable.
    expect(negotiate("deflate")).toEqual(["identity"]);
    expect(acceptableEncodings(request())).toEqual(["identity"]);
  });

  test("an identity preference outranks weaker gzip", () => {
    expect(negotiate("identity;q=1, gzip;q=0.5")).toEqual(["identity", "gzip"]);
    expect(negotiate("gzip;q=0.9, identity;q=0.1")).toEqual(["gzip", "identity"]);
  });
});

describe("JSON responses", () => {
  const payload = JSON.stringify({ label: "xin chào ✓ 漢字", pad: "x".repeat(4096) });
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  };
  const json = (acceptEncoding: string) =>
    compressibleResponse(request({ "accept-encoding": acceptEncoding }), payload, {
      status: 200,
      headers,
    });

  test("gzip decodes to exactly the identity representation, unicode included", async () => {
    const encoded = json("gzip");
    const identity = json("identity");
    expect(encoded.headers.get("content-encoding")).toBe("gzip");
    expect(identity.headers.get("content-encoding")).toBeNull();

    const encodedBytes = new Uint8Array(await encoded.arrayBuffer());
    const identityBytes = new Uint8Array(await identity.arrayBuffer());
    expect(new TextDecoder().decode(gunzipSync(encodedBytes))).toBe(payload);
    expect(new TextDecoder().decode(identityBytes)).toBe(payload);
    expect(encodedBytes.byteLength).toBeLessThan(identityBytes.byteLength);
  });

  test("both variants advertise Vary and keep the API's no-store contract", () => {
    for (const acceptEncoding of ["gzip", "identity", "gzip;q=0"]) {
      const response = json(acceptEncoding);
      expect(response.headers.get("vary")).toBe("accept-encoding");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("content-type")).toBe(headers["content-type"]);
    }
  });

  test("a client that rejects identity and gzip is refused rather than mis-served", async () => {
    for (const acceptEncoding of ["identity;q=0", "*;q=0", "gzip;q=0, identity;q=0"]) {
      const response = json(acceptEncoding);
      expect(response.status).toBe(406);
      expect(response.headers.get("content-encoding")).toBeNull();
      expect(response.headers.get("vary")).toBe("accept-encoding");
    }
  });

  test("an unsupported encoding alone does not refuse the request", async () => {
    // `br` is not offered, but it leaves identity acceptable, so the client
    // simply receives the representation it can decode.
    const response = json("br");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(new TextDecoder().decode(await decodedBody(response))).toBe(payload);
  });

  test("bodies below the threshold stay identity even when gzip is preferred", async () => {
    const small = "x".repeat(MIN_COMPRESS_BYTES - 1);
    const response = compressibleResponse(request({ "accept-encoding": "gzip" }), small, {
      status: 201,
      headers,
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(new TextDecoder().decode(await decodedBody(response))).toBe(small);
  });

  test("gzip-only clients can receive a small response", async () => {
    const response = compressibleResponse(
      request({ "accept-encoding": "gzip, identity;q=0" }),
      JSON.stringify({ error: "Không tìm thấy" }),
      { status: 404, headers },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(JSON.parse(new TextDecoder().decode(await decodedBody(response)))).toEqual({
      error: "Không tìm thấy",
    });
  });
});

describe("static assets", () => {
  const root = path.join(scratch, "dist");
  const document = `<!doctype html><html><body>${"paragraph ".repeat(400)}</body></html>`;
  const binary = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
  const immutable = { "cache-control": "public, max-age=31536000, immutable" };

  mkdirSync(path.join(root, "assets"), { recursive: true });
  writeFileSync(path.join(root, "index.html"), document);
  writeFileSync(path.join(root, "index.html.gz"), gzipSync(Buffer.from(document)));
  writeFileSync(path.join(root, "assets", "photo.png"), binary);
  writeFileSync(path.join(root, "assets", "photo.png.gz"), gzipSync(Buffer.from(binary)));
  writeFileSync(path.join(root, "assets", "plain.js"), "console.log('x');");

  test("serves the precompressed sidecar with the original media type", async () => {
    const response = await staticFileResponse(
      request({ "accept-encoding": "gzip" }),
      path.join(root, "index.html"),
      immutable,
    );
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("vary")).toBe("accept-encoding");
    expect(response.headers.get("cache-control")).toBe(immutable["cache-control"]);
    expect(new TextDecoder().decode(await decodedBody(response))).toBe(document);
  });

  test("serves the original bytes to a client without gzip support", async () => {
    const response = await staticFileResponse(
      request({ "accept-encoding": "identity" }),
      path.join(root, "index.html"),
      immutable,
    );
    expect(response.headers.get("content-encoding")).toBeNull();
    // Vary must still be present: a shared cache may hold the encoded variant.
    expect(response.headers.get("vary")).toBe("accept-encoding");
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe(document);
  });

  test("a file requested by its .gz name is never encoded a second time", async () => {
    const response = await staticFileResponse(
      request({ "accept-encoding": "gzip" }),
      path.join(root, "index.html.gz"),
      immutable,
    );
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("vary")).toBeNull();
    // Identity here means the stored gzip bytes travel as-is, exactly once.
    const body = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(gunzipSync(body))).toBe(document);
  });

  test("already-compressed media ignores a matching sidecar", async () => {
    const response = await staticFileResponse(
      request({ "accept-encoding": "gzip" }),
      path.join(root, "assets", "photo.png"),
      immutable,
    );
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("vary")).toBeNull();
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual(Array.from(binary));
  });

  test("a file without a sidecar is served identity even when gzip is accepted", async () => {
    const response = await staticFileResponse(
      request({ "accept-encoding": "gzip" }),
      path.join(root, "assets", "plain.js"),
      immutable,
    );
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("vary")).toBeNull();
    expect(response.headers.get("content-type")).toContain("javascript");
  });

  test("a Range request receives the identity representation", async () => {
    // Bun slices whichever file it is given; a slice of a gzip stream is not a
    // decodable body, so the encodable variant must not be selected here.
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (incoming) => staticFileResponse(incoming, path.join(root, "index.html"), immutable),
    });
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/index.html`, {
        headers: { "accept-encoding": "gzip", range: "bytes=0-9" },
      });
      expect(response.status).toBe(206);
      expect(response.headers.get("content-encoding")).toBeNull();
      expect(response.headers.get("vary")).toBe("accept-encoding");
      expect(response.headers.get("content-range")).toBe(
        `bytes 0-9/${Buffer.byteLength(document)}`,
      );
      expect(await response.text()).toBe(document.slice(0, 10));
    } finally {
      await server.stop(true);
    }
  });

  test("a client that rejects both encodings is refused", async () => {
    // The gzip sidecar exists, but a client that accepts neither representation
    // must not silently receive one of them.
    const response = await staticFileResponse(
      request({ "accept-encoding": "identity;q=0, gzip;q=0" }),
      path.join(root, "index.html"),
      immutable,
    );
    expect(response.status).toBe(406);
  });
});

describe("build sidecars", () => {
  /**
   * Invoke the plugin's bundle hook against a synthetic bundle. This pins only
   * the sidecar decision (extension, size, benefit); the integration test below
   * proves the hook actually runs inside Vite.
   */
  async function emitFor(bundle: Record<string, unknown>) {
    const plugin = assetCompression();
    const hook = plugin.generateBundle;
    if (!hook || typeof hook === "function") throw new Error("expected an object hook");
    const emitted: { fileName: string; source: Uint8Array }[] = [];
    const context = {
      emitFile: (file: { fileName: string; source: Uint8Array }) => emitted.push(file),
    };
    await hook.handler.call(context as never, {} as never, bundle as never, false as never);
    return emitted;
  }

  const asset = (source: string | Uint8Array) => ({ type: "asset", source, fileName: "x" });
  const huge = "uniform text ".repeat(500);
  /** High-entropy bytes: gzip cannot shrink these, so no sidecar is written. */
  const noise = new Uint8Array(MIN_COMPRESS_BYTES * 2);
  let noiseSeed = 0x12345678;
  for (let index = 0; index < noise.length; index += 1) {
    noiseSeed ^= noiseSeed << 13;
    noiseSeed ^= noiseSeed >>> 17;
    noiseSeed ^= noiseSeed << 5;
    noise[index] = noiseSeed & 0xff;
  }

  test("only compressible, large, beneficial outputs get a sidecar", async () => {
    const emitted = await emitFor({
      "index.html": asset(`<!doctype html>${huge}`),
      "assets/app.js": { type: "chunk", code: huge, fileName: "assets/app.js" },
      "assets/app.css": asset(huge),
      "tiny.js": asset("export const a = 1;"),
      "assets/photo.png": asset(noise),
      "assets/noise.js": asset(noise),
    });

    expect(emitted.map((file) => file.fileName).sort()).toEqual([
      "assets/app.css.gz",
      "assets/app.js.gz",
      "index.html.gz",
    ]);
  });

  test("emitted sidecars decode to the source bytes and are never re-encoded", async () => {
    const source = `console.log(${JSON.stringify(huge)});`;
    const [sidecar] = await emitFor({
      "assets/app.js": { type: "chunk", code: source, fileName: "assets/app.js" },
    });

    expect(sidecar.fileName).toBe("assets/app.js.gz");
    expect(new TextDecoder().decode(gunzipSync(sidecar.source))).toBe(source);
    // A `.gz` name is not compressible, so a sidecar can never gain a sibling.
    expect(await emitFor({ "assets/app.js.gz": asset(new Uint8Array(sidecar.source)) })).toEqual(
      [],
    );
  });

  test("compresses emitted document and hashed assets, skipping binary output", async () => {
    const project = path.join(scratch, "project");
    const dist = path.join(project, "dist");
    const filler = "lorem ipsum dolor sit amet ".repeat(220);
    const largeCss = Array.from(
      { length: 160 },
      (_, index) => `.utility-${index} { padding: ${index}px; margin: ${index}px; }`,
    ).join("\n");

    // A PNG above the gzip threshold: only its media type may exclude it.
    const png = new Uint8Array(MIN_COMPRESS_BYTES * 2);
    for (let index = 0; index < png.length; index += 1) png[index] = index % 251;

    mkdirSync(path.join(project, "src"), { recursive: true });
    mkdirSync(path.join(project, "public"), { recursive: true });
    await Bun.write(
      path.join(project, "index.html"),
      `<!doctype html><html><body><p>${filler}</p><div id="root"></div>` +
        `<script type="module" src="/src/main.ts"></script></body></html>`,
    );
    await Bun.write(
      path.join(project, "src", "main.ts"),
      `import "./large.css";\nimport { body } from "./data";\n` +
        `document.getElementById("root")!.textContent = body;\n`,
    );
    await Bun.write(
      path.join(project, "src", "data.ts"),
      `export const body = ${JSON.stringify(filler)};\n`,
    );
    await Bun.write(path.join(project, "src", "large.css"), largeCss);
    await Bun.write(path.join(project, "public", "photo.png"), png);

    // Vite's HTML plugin adds `index.html` from its own generateBundle hook, so
    // this also proves the sidecar hook runs after it rather than missing it.
    await build({
      root: project,
      logLevel: "silent",
      plugins: [assetCompression()],
      build: { outDir: dist, emptyOutDir: true },
    });

    const emitted = [...new Bun.Glob("**/*").scanSync({ cwd: dist })].sort();
    const gzipped = emitted.filter((file) => file.endsWith(".gz"));

    expect(gzipped).toContain("index.html.gz");
    expect(gzipped.some((file) => /^assets\/.*\.js\.gz$/.test(file))).toBe(true);
    expect(gzipped.some((file) => /^assets\/.*\.css\.gz$/.test(file))).toBe(true);
    expect(gzipped.some((file) => file.endsWith(".png.gz"))).toBe(false);
    expect(emitted).toContain("photo.png");
    expect(emitted.some((file) => file.endsWith(".gz.gz"))).toBe(false);

    // Every sidecar replaces its original on the wire, so bytes must match.
    for (const sidecar of gzipped) {
      const originalPath = path.join(dist, sidecar.slice(0, -".gz".length));
      const original = new Uint8Array(await Bun.file(originalPath).arrayBuffer());
      const restored = gunzipSync(
        new Uint8Array(await Bun.file(path.join(dist, sidecar)).arrayBuffer()),
      );
      expect(Buffer.compare(Buffer.from(restored), Buffer.from(original))).toBe(0);
    }
  }, 120_000);
});
