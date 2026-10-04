"use client";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { Toaster, toast } from "sonner";

import { ConfirmProvider } from "@/components/common/confirm";
import { TooltipProvider } from "@/components/ui/controls";
import { ApiError } from "@/lib/api/client";

import { ThemeProvider, useTheme } from "./theme";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        // Retry network blips, never client errors (403/404/422…).
        retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      },
    },
    mutationCache: new MutationCache({
      // Every failed action shows the API's message, unless the caller opts out.
      onError: (err, _vars, _ctx, mutation) => {
        if (mutation.options.meta?.silent) return;
        const e = err as ApiError;
        if (e.status === 401) return;
        toast.error(e.message ?? "Something went wrong", { description: e.requestId ? `ref ${e.requestId}` : undefined });
      },
    }),
  });
}

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { silent?: boolean };
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(makeClient);
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={300}>
          <ConfirmProvider>{children}</ConfirmProvider>
          <ThemedToaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster theme={resolved} position="bottom-right" richColors closeButton />;
}
