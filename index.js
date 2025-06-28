// v1.0.3 gr8r-revai-worker
// - ADDED: `name` field set to `metadata.title` for cleaner display in Rev.ai dashboard
// - RETAINED: JSON.stringify of full metadata for automation compatibility
// - PRESERVED: Grafana logging for both success and error cases
// v1.0.2 gr8r-revai-worker
// - FIXED: Converts metadata to JSON string before sending to Rev.ai (required format)
// v1.0.1 gr8r-revai-worker
// - ADDED: Grafana logging for success and error cases
// v1.0.0 gr8r-revai-worker
// - INITIAL RELEASE

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/revai/transcribe" && request.method === "POST") {
      try {
        const body = await request.json();
        const { media_url, metadata, callback_url } = body;

        if (!media_url || !metadata || !callback_url) {
          return new Response("Missing required fields", { status: 400 });
        }

        const revPayload = {
          media_url,
          metadata: JSON.stringify(metadata),
          name: metadata.title || "Untitled", // ✅ clean job name for Rev.ai dashboard
          callback_url,
          custom_vocabulary_id: "cvyeFz2ApdhD4nVfoW" // TODO: make configurable
        };

        const revResponse = await fetch("https://api.rev.ai/speechtotext/v1/jobs", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.REVAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(revPayload)
        });

        const resultText = await revResponse.text();
        const success = revResponse.ok;

        // Log to Grafana
        await env.GRAFANA.fetch(new Request('https://internal/api/grafana', {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            level: success ? "info" : "error",
            message: success
              ? "Rev.ai transcription job started"
              : `Rev.ai error: ${resultText}`,
            meta: {
              source: "gr8r-revai-worker",
              service: "transcribe",
              media_url,
              metadata,
              callback_url,
              revStatus: revResponse.status,
              ...(success ? {} : { revResponse: resultText })
            }
          })
        }));

        return new Response(resultText, {
          status: revResponse.status,
          headers: { "Content-Type": "application/json" }
        });

      } catch (err) {
        // Log internal error to Grafana
        await env.GRAFANA.fetch(new Request('https://internal/api/grafana', {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            level: "error",
            message: "Unhandled Rev.ai job error",
            meta: {
              source: "gr8r-revai-worker",
              service: "transcribe",
              error: err.message,
              stack: err.stack
            }
          })
        }));

        return new Response(JSON.stringify({
          error: "Internal error",
          message: err.message
        }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    return new Response("Not found", { status: 404 });
  }
};

