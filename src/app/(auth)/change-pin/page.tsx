import { requireActor } from "@/server/auth/session";
import { ChangePinForm } from "./form";

export default async function ChangePinPage() {
  const actor = await requireActor({ allowPinChange: true });
  return (
    <main data-page="change-pin" className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="h1">Set your PIN</h1>
      <p className="muted mb-5 mt-1 text-[#66545d]">
        Hi {actor.displayName}. {actor.mustChangePin ? "Choose a new 6-digit PIN to replace your temporary one." : "Change your 6-digit PIN."}
      </p>
      <div className="rounded-[20px] border border-[#ded5c9] bg-white p-5 shadow-sm shadow-[#66545d]/5 sm:p-6">
        <ChangePinForm />
      </div>
    </main>
  );
}
