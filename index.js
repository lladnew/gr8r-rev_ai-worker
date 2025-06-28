// v1.0.4 gr8r-revai-worker
// - CHANGED: Now returns full parsed Rev.ai job object (not just text)
// - CHANGED: Sends metadata as plain title string instead of full JSON
// - RETAINED: Clean job name in Rev.ai dashboard
// - PRESERVED: Grafana logging and error capture
// v1.0.3 gr8r-revai-worker
// - ADDED: `name` field set to `metadata.title` for cleaner display in Rev.ai dashboard

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

        const title = typeof metadata === "string" ? metadata : metadata.title || "Untitled";

        const revPayload = {
          media_url,
          metadata: title, // ✅ simplified metadata string
          name: title,      // ✅ clean UI in Rev.ai
          callback_url,
          custom_vocabulary_id: "cvyeFz2ApdhD4nVfoW"
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

        let resultJson = {};
        try {
          resultJson = JSON.parse(resultText);
        } catch (e) {
          // fallback in case of unexpected non-JSON error body
          resultJson = { raw: resultText };
        }

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
              metadata: title,
              callback_url,
              revStatus: revResponse.status,
              ...(success ? {} : { revResponse: resultText })
            }
          })
        }));

        return new Response(JSON.stringify(resultJson), {
          status: revResponse.status,
          headers: { "Content-Type": "application/json" }
        });

      } catch (err) {
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
