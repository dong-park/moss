// Always evaluate the runtime revision, including on repeated health probes.
export const dynamic = "force-dynamic";

export function GET(): Response {
  const sha = process.env.BUILD_SHA;
  const release = process.env.RELEASE_SHA;
  // A manual/local build without any revision is explicitly unversioned: serving, but never a release.
  const unversioned = !sha && !release;
  const ready = unversioned || (typeof sha === "string" && /^[0-9a-fA-F]{40}$/.test(sha) &&
    sha.length === 40 && release === sha);
  const body = unversioned ? { status: "unversioned" } : ready ? { status: "ready", sha } : { status: "unavailable" };
  return Response.json(body, {
    status: ready ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
