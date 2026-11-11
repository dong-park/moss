// Always evaluate the runtime revision, including on repeated health probes.
export const dynamic = "force-dynamic";

export function GET(): Response {
  const sha = process.env.BUILD_SHA;
  const release = process.env.RELEASE_SHA;
  const ready = typeof sha === "string" && /^[0-9a-fA-F]{40}$/.test(sha) &&
    sha.length === 40 && release === sha;
  return Response.json(ready ? { status: "ready", sha } : { status: "unavailable" }, {
    status: ready ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
