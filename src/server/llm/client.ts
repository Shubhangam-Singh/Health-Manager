/**
 * Gemini client. Every call is a network call to someone else's overloaded
 * GPU, so it is treated like one: hard timeout, one retry, and a typed result
 * instead of a thrown exception.
 *
 * Returns a discriminated union rather than throwing, because "the model did
 * not answer" is a NORMAL outcome the caller must handle, not an exception.
 */

// gemini-2.5-flash, not a newer preview model. The free tier for
// gemini-3.6-flash is 20 requests PER DAY, which a single demo session
// exhausts. 2.5-flash has a far higher daily allowance and, being a
// non-reasoning model, spends its whole output budget on the answer instead
// of on internal thinking — which was truncating our JSON.
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
// 30s, not 15s. Every call site runs OUTSIDE the request path -- in after()
// or in a cron job -- so nothing is waiting on this. The tighter budget was
// chosen for a blocking call and made the longer post-visit prompt time out
// while the model was still reasoning. Overridable for tuning.
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 30_000);
const MAX_ATTEMPTS = 2; // one try, then one retry

export type LlmResult =
  | { ok: true; text: string; attempts: number }
  | { ok: false; error: string; attempts: number };

export async function generateJson(
  systemInstruction: string,
  userPrompt: string,
): Promise<LlmResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    // A missing key is a config error, not a transient one -- never retried.
    return { ok: false, error: "GEMINI_API_KEY is not set", attempts: 0 };
  }

  let lastError = "unknown error";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // AbortController is what actually stops the request. Without it, fetch
    // can hang far longer than any timeout you think you have.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: {
              // Low temperature: this is extraction, not creative writing.
              temperature: 0.2,
              // Generous, and deliberately so. Newer flash models spend part
              // of their output budget on internal reasoning before writing
              // the answer, so a tight cap truncates the JSON mid-string --
              // which surfaces as "Unterminated string in JSON". Diagnosed
              // exactly that way from a stored rawModelOutput.
              maxOutputTokens: 4096,
              // Ask the API itself to guarantee JSON. Belt; zod is braces.
              responseMimeType: "application/json",
            },
          }),
        },
      );

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        lastError = `HTTP ${res.status}: ${body.slice(0, 300)}`;
        // 4xx means our request is wrong -- retrying sends the same wrong
        // request. Only 5xx and 429 are worth trying again.
        if (res.status < 500 && res.status !== 429) {
          return { ok: false, error: lastError, attempts: attempt };
        }
      } else {
        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          lastError = "model returned no text";
        } else {
          return { ok: true, text, attempts: attempt };
        }
      }
    } catch (e) {
      lastError =
        e instanceof Error && e.name === "AbortError"
          ? `timed out after ${TIMEOUT_MS}ms`
          : e instanceof Error ? e.message : String(e);
    } finally {
      clearTimeout(timer); // always, or the timer leaks and can abort later
    }
  }

  return { ok: false, error: lastError, attempts: MAX_ATTEMPTS };
}
