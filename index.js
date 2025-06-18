// v1.0.1 gr8r-revai-worker
// - ADDED: Grafana logging for success and error cases
// - LOGS: request metadata, response status, and full error object if applicable
// - PRESERVED: hardcoded custom_vocabulary_id (tagged with TODO for future flexibility)

// v1.0.0 gr8r-revai-worker
// - INITIAL RELEASE: triggers Rev.ai transcription job via POST
// - Uses hardcoded custom_vocabulary_id for now (may need updating later)

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
          metadata,
          callback_url,
          custom_vocabulary_id: "cvyeFz2ApdhD4nVfoW" // TODO: Make this configurable
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
