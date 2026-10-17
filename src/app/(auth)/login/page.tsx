import { redirect } from "next/navigation";
import { getActor, homePath } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const actor = await getActor();
  if (actor) redirect(homePath(actor));
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-brand-500 text-xl font-black text-slate-950">SA</div>
        <div>
          <h1 className="text-xl font-bold">Site Attendance</h1>
          <p className="muted">Log in with your username and PIN</p>
        </div>
      </div>
      <div className="card">
        <LoginForm />
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">Forgot your PIN? Ask your site manager or administrator to reset it.</p>
    </main>
  );
}
