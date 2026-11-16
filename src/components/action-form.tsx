"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

export type ActionState = { ok?: string; error?: string; fieldErrors?: Record<string, string>; at?: number };
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
  inlineErrors = false,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
  inlineErrors?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [dismissedState, setDismissedState] = useState<ActionState | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  useEffect(() => {
    if (!inlineErrors) return;
    const form = ref.current;
    if (!form) return;
    const controls = Array.from(form.elements).filter(
      (element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
        element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement,
    );
    for (const control of controls) control.setCustomValidity("");
    if (!pending) {
      for (const [name, message] of Object.entries(state.fieldErrors ?? {})) {
        const control = controls.find((element) => element.name === name);
        control?.setCustomValidity(message);
      }
      if (state.fieldErrors) form.reportValidity();
    }
    // Date/time widgets update a backing input through React, so listen on the
    // whole form and clear stale server validation whenever the user edits it.
    const clear = () => {
      for (const control of controls) control.setCustomValidity("");
    };
    form.addEventListener("input", clear);
    form.addEventListener("change", clear);
    return () => {
      clear();
      form.removeEventListener("input", clear);
      form.removeEventListener("change", clear);
    };
  }, [state, pending, inlineErrors]);
  return (
    <ActionPending.Provider value={pending}>
    <form
      ref={ref}
      action={formAction}
      className={className}
      onInvalidCapture={() => setDismissedState(state)}
      onChangeCapture={() => setDismissedState(state)}
      onInputCapture={(event) => {
        if (event.nativeEvent.isTrusted) setDismissedState(state);
      }}
      onSubmit={(event) => {
        // Dispatch explicitly: React's automatic action reset also clears inputs
        // when the server returns a validation error instead of throwing.
        event.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        setDismissedState(state);
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const data = new FormData(event.currentTarget, submitter);
        startTransition(() => formAction(data));
      }}
    >
      {children}
      {!pending && dismissedState !== state && <FormMessage state={!inlineErrors && state.fieldErrors ? { ...state, error: Object.values(state.fieldErrors).join(" ") } : state} />}
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

export function SubmitButton({ children, className = "btn-primary", name, value, disabled = false }: { children: React.ReactNode; className?: string; name?: string; value?: string; disabled?: boolean }) {
  const { pending: formPending } = useFormStatus();
  const actionPending = useContext(ActionPending);
  const pending = formPending || actionPending;
  return (
    <button type="submit" className={className} disabled={pending || disabled} name={name} value={value}>
      {pending ? "Saving…" : children}
    </button>
  );
}
