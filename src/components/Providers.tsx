"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "react-hot-toast";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={10 * 60} refetchOnWindowFocus={false}>
      {children}
      <Toaster
        position="top-right"
        containerClassName="print:!hidden print:hidden"
        toastOptions={{
          className: "print:!hidden",
          duration: 3500,
          style: {
            borderRadius: "14px",
            padding: "12px 16px",
            fontSize: "14px",
            fontWeight: 600,
            boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.12)",
          },
          success: {
            style: {
              background: "#ecfdf5",
              color: "#065f46",
              border: "1px solid #a7f3d0",
            },
          },
          error: {
            style: {
              background: "#fef2f2",
              color: "#991b1b",
              border: "1px solid #fecaca",
            },
          },
        }}
      />
    </SessionProvider>
  );
}
