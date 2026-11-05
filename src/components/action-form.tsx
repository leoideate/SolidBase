"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

export type ActionState = { ok?: string; error?: string; at?: number };
type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const ActionPending = createContext(false);

/**
 * Form bound to a server action. Shows success only after the server confirms the save, and an
 * explicit error otherwise (Q01).
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  confirm,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <ActionPending.Provider value={pending}>
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(event) => {
        // Dispatch explicitly: React's automatic action reset also clears inputs
        // when the server returns a validation error instead of throwing.
        event.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const data = new FormData(event.currentTarget, submitter);
        startTransition(() => formAction(data));
      }}
    >
      {children}
      <FormMessage state={state} />
    </form>
    </ActionPending.Provider>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state.error)
    return (
      <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
        {state.error}
      </p>
    );
  if (state.ok)
    return (
      <p role="status" className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        {state.ok}
      </p>
    );
  return null;
}

export function SubmitButton({ children, className = "btn-primary", name, value }: { children: React.ReactNode; className?: string; name?: string; value?: string }) {
  const { pending: formPending } = useFormStatus();
  const actionPending = useContext(ActionPending);
  const pending = formPending || actionPending;
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {pending ? "Saving…" : children}
    </button>
  );
}
