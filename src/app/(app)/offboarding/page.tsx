import { redirect } from "next/navigation";

/** Offboarding now lives as a tab on the Employees page. */
export default function OffboardingListPage() {
  redirect("/employees?tab=offboarding");
}
