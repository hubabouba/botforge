import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";

export const metadata: Metadata = { title: "Вход" };

export default function LoginPage() {
  return <AuthCard mode="login" />;
}
