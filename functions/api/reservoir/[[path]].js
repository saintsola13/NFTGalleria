// Alchemy proxy retired — Okina Galleria serves baked static token JSON + R2 images.
export async function onRequest() {
  return new Response(JSON.stringify({ error: "baked", message: "live Alchemy pulls disabled; use static /tokens/" }), {
    status: 410,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
    },
  });
}
