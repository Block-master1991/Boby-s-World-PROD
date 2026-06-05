import { AccountRecovery } from "@/components/auth/AccountRecovery";
import Link from "next/link";

export const metadata = {
  title: "Account Recovery | Boby's World",
  description: "Recover access to your account using your registered email.",
};

export default function RecoveryPage() {
  return (
    <div className="container relative flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-1 lg:px-0 min-h-screen">
      <div className="lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <AccountRecovery />
          <div className="text-center mt-4">
            <Link href="/" className="text-xs text-muted-foreground hover:text-primary underline">
              ← Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
