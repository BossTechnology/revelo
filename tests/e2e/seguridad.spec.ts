import { expect, test } from "@playwright/test";

/** PLAN.md §12: encabezados de seguridad en todas las respuestas. */
test("encabezados de seguridad: CSP, X-Frame-Options DENY y nosniff", async ({
  request,
}) => {
  for (const path of ["/login", "/.well-known/oauth-protected-resource"]) {
    const res = await request.get(path);
    const h = res.headers();
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["content-security-policy"], path).toContain(
      "frame-ancestors 'none'",
    );
    expect(h["content-security-policy"], path).toContain(
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL}`,
    );
  }
});
