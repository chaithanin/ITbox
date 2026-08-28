import { redirect } from "next/navigation";

/** Onboarding now lives as a tab on the Employees page. */
export default function OnboardingPage() {
  redirect("/employees?tab=onboarding");
}
