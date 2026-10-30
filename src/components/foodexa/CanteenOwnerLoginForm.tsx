import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { loginCanteenOwner } from "@/lib/hungry.functions";

const field = "w-full rounded-2xl border border-input bg-ink-soft px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition focus:border-primary";

export function CanteenOwnerLoginForm({ initialError = "", onRegister }: { initialError?: string; onRegister?: () => void }) {
  const login = useServerFn(loginCanteenOwner);
  const [loginId, setLoginId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const normalizedLoginId = loginId.trim().toUpperCase();
    if (!/^[A-Z2-9]{7}$/.test(normalizedLoginId)) return setError("Enter your approved 7-character Canteen Owner ID.");
    if (!/^[A-Z2-9]{7}$/.test(code)) return setError("Enter your approved 7-character Owner Password Code.");
    setBusy(true);
    try {
      const session = await login({ data: { loginId: normalizedLoginId, code } });
      const { error: authError } = await supabase.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });
      if (authError) throw new Error(authError.message);
      window.location.assign("/canteen");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify your owner login. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-4">
      <input
        required
        value={loginId}
        onChange={(e) => setLoginId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7))}
        placeholder="7-Character Canteen Owner ID"
        aria-label="7-Character Canteen Owner ID"
        autoComplete="username"
        autoCapitalize="characters"
        className={`${field} py-4 text-center text-sm tracking-normal placeholder:text-muted-foreground placeholder:opacity-100 sm:text-base`}
      />
      <input
        required
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7))}
        placeholder="7-Character Owner Password Code"
        aria-label="7-Character Owner Password Code"
        autoComplete="one-time-code"
        autoCapitalize="characters"
        className={`${field} py-4 text-center text-sm tracking-normal placeholder:text-muted-foreground placeholder:opacity-100 sm:text-base`}
      />
      {(error || initialError) && <p role="alert" className="text-sm text-primary-bright">{error || initialError}</p>}
      <button disabled={busy} className="w-full rounded-full bg-primary py-4 text-sm font-semibold text-primary-foreground transition hover:shadow-[0_0_40px_-6px_var(--primary-bright)] disabled:opacity-60">
        {busy ? "Verifying…" : "Canteen Owner Login"}
      </button>
      {onRegister && (
        <button type="button" onClick={onRegister} className="block w-full text-center text-xs font-semibold text-primary-bright underline underline-offset-4">
          Not approved yet? Register your canteen
        </button>
      )}
    </form>
  );
}
