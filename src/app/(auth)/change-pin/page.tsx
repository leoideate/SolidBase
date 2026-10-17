import { requireActor } from "@/server/auth/session";
import { ChangePinForm } from "./form";

export default async function ChangePinPage() {
  const actor = await requireActor({ allowPinChange: true });
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="h1">Set your PIN</h1>
      <p className="muted mb-4 mt-1">
        Hi {actor.displayName}. {actor.mustChangePin ? "Choose a new 6-digit PIN to replace your temporary one." : "Change your 6-digit PIN."}
      </p>
      <div className="card">
        <ChangePinForm />
      </div>
    </main>
  );
}
