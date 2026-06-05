import type { Metadata } from "next";
import SettingsPageClient from "@/app/settings/SettingsPageClient";

export const metadata: Metadata = {
  title: "Settings – Boby World",
  description: "Manage your account security, two-factor authentication, and passkeys.",
};

export default function SettingsPage() {
  return <SettingsPageClient />;
}
