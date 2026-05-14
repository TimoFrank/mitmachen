import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/forms";
import { loginAction } from "@/lib/actions";
import { getSessionUserId } from "@/lib/auth";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await getSessionUserId();

  if (userId) {
    redirect("/");
  }

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <div className="login-page">
      <div className="login-card stack">
        <div>
          <p className="eyebrow">Versorgungs-CRM</p>
          <h1>Passwort-Login</h1>
          <p className="muted">Demo-Zugang: `anna@versorgungscrm.local` oder `marc@versorgungscrm.local`, Passwort `demo1234`.</p>
        </div>

        {error ? (
          <p className="error-text">
            {error === "invalid" ? "Anmeldedaten sind ungueltig." : "Bitte E-Mail und Passwort ausfuellen."}
          </p>
        ) : null}

        <form action={loginAction} className="stack">
          <label>
            E-Mail
            <input name="email" type="email" required />
          </label>
          <label>
            Passwort
            <input name="password" type="password" required />
          </label>
          <SubmitButton pendingLabel="Meldet an...">Anmelden</SubmitButton>
        </form>
      </div>
    </div>
  );
}
