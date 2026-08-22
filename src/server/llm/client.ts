/**
 * Gemini client. Every call is a network call to someone else's overloaded
 * GPU, so it is treated like one: hard timeout, one retry, and a typed result
 * instead of a thrown exception.
 *
 * Returns a discriminated union rather than throwing, because "the model did
 * not answer" is a NORMAL outcome the caller must handle, not an exception.
 */

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
const TIMEOUT_MS = 15_000;
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
              maxOutputTokens: 800,
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
