import { redirect } from "next/navigation";
import { weekStartOf } from "@/lib/time";

export default function CurrentWeek() {
  redirect(`/timesheets/${weekStartOf(new Date())}`);
}
