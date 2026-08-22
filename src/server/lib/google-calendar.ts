import { google } from "googleapis";
import { prisma } from "./prisma";

/**
 * Google Calendar via OAuth 2.0 authorisation-code flow.
 *
 * WHY THIS IS SEPARATE FROM LOGIN: signing in proves identity; connecting a
 * calendar delegates a capability. Different consent, different lifetime,
 * different revocation. A user can disconnect their calendar and keep their
 * account, and most users never connect one at all.
 */

/** Only what we need. Narrow scopes are easier to justify on the consent screen. */
export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function isCalendarConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

/**
 * Step 1 of the flow: where we send the user to consent.
 *
 * access_type "offline" is what makes Google return a REFRESH token; without
 * it we would only get an access token that dies in an hour and could never
 * be renewed without the user present.
 *
 * prompt "consent" forces the consent screen even on re-authorisation, because
 * Google only returns a refresh token the FIRST time unless you ask again --
 * a classic source of "it worked in dev, it broke in prod".
 *
 * `state` carries the user id, signed by being unguessable, so the callback
 * knows who came back.
 */
export function buildConsentUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: CALENDAR_SCOPES,
    state,
    include_granted_scopes: true,
  });
}

/** Step 2: exchange the one-time code for tokens. */
export async function exchangeCodeForTokens(code: string) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    // Without a refresh token the connection is useless after an hour.
    throw new Error(
      "Google did not return a refresh token. Revoke the app at " +
      "https://myaccount.google.com/permissions and connect again.",
    );
  }
  let email: string | undefined;
  try {
    client.setCredentials(tokens);
    const info = await google.oauth2({ version: "v2", auth: client }).userinfo.get();
    email = info.data.email ?? undefined;
  } catch { /* email is nice to have, not required */ }

  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token ?? null,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scope: tokens.scope ?? null,
    googleEmail: email ?? null,
  };
}

/**
 * An authorised client for a user, refreshing the access token when needed.
 * The googleapis client refreshes automatically given a refresh token; we
 * persist the new access token so other instances benefit too.
 */
export async function clientForUser(userId: string) {
  const account = await prisma.googleAccount.findUnique({ where: { userId } });
  if (!account) return null;

  const client = oauthClient();
  client.setCredentials({
    refresh_token: account.refreshToken,
    access_token: account.accessToken ?? undefined,
    expiry_date: account.expiresAt?.getTime(),
  });

  client.on("tokens", (tokens) => {
    void prisma.googleAccount.update({
      where: { userId },
      data: {
        accessToken: tokens.access_token ?? account.accessToken,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : account.expiresAt,
      },
    }).catch(() => { /* refresh persistence is best effort */ });
  });

  return client;
}
