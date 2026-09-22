"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchMe } from "@/lib/api";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    fetchMe()
      .then((user) => router.replace(user.mustChangePassword ? "/cambiar-password" : "/dashboard"))
      .catch(() => router.replace("/login"));
  }, [router]);

  return null;
}
