"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/action-form";
import { changePinAction } from "../actions";

const pinProps = { className: "input tracking-[0.4em]", type: "password", inputMode: "numeric", pattern: "\\d{6}", maxLength: 6, required: true } as const;

export function ChangePinForm() {
  const [state, action] = useActionState(changePinAction, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="currentPin">Current PIN</label>
        <input id="currentPin" name="currentPin" autoComplete="current-password" {...pinProps} />
      </div>
      <div>
        <label className="label" htmlFor="newPin">New PIN</label>
        <input id="newPin" name="newPin" autoComplete="new-password" {...pinProps} />
      </div>
      <div>
        <label className="label" htmlFor="confirmPin">Repeat new PIN</label>
        <input id="confirmPin" name="confirmPin" autoComplete="new-password" {...pinProps} />
      </div>
      <SubmitButton className="btn-brand w-full bg-[#b38323]! text-white hover:bg-[#9a701c]! focus-visible:outline-[#92754e]">Save PIN</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
