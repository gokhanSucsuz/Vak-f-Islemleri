"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "react-hot-toast";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={10 * 60} refetchOnWindowFocus={true}>
      {children}
      <Toaster position="top-right" />
    </SessionProvider>
  );
}
