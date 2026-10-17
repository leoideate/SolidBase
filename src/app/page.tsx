import { redirect } from "next/navigation";
import { getActor, homePath } from "@/server/auth/session";

export default async function Home() {
  const actor = await getActor();
  redirect(actor ? homePath(actor) : "/login");
}
