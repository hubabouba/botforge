import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return <AuthCard mode="signup" />;
}
