import { redirect } from "next/navigation";
import { getActor, homePath } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const actor = await getActor();
  if (actor) redirect(homePath(actor));
  return (
    <main data-page="login" className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/solidbase-logo.svg" alt="Solid Base Limited" className="h-24 w-auto" />
        <h1 className="sr-only">SolidBase</h1>
        <p className="muted mt-4 text-[#66545d]">Log in with your username and PIN</p>
      </div>
      <div className="rounded-[20px] border border-[#ded5c9] bg-white p-5 shadow-sm shadow-[#66545d]/5 sm:p-6">
        <LoginForm />
      </div>
      <p className="mt-4 text-center text-xs text-[#66545d]">Forgot your PIN? Ask your site manager or administrator to reset it.</p>
    </main>
  );
}
