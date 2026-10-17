"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/action-form";
import { loginAction } from "../actions";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="username">
          Username
        </label>
        <input id="username" name="username" className="input" autoComplete="username" autoCapitalize="none" required />
      </div>
      <div>
        <label className="label" htmlFor="pin">
          PIN
        </label>
        <input id="pin" name="pin" className="input tracking-[0.4em]" type="password" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="current-password" required />
      </div>
      <SubmitButton className="btn-primary w-full">Log in</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
