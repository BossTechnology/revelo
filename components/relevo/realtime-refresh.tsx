"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Escucha cambios de tareas, respuestas, adjuntos e historial y refresca la vista. Realtime
 * respeta RLS: solo llegan cambios de proyectos donde la persona es miembro.
 */
export function RealtimeRefresh({ projectId }: { projectId?: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };

    const taskFilter = projectId
      ? { filter: `project_id=eq.${projectId}` }
      : {};
    const channel = supabase
      .channel(`relevo-${projectId ?? "todo"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", ...taskFilter },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "replies" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attachments" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_events" },
        refresh,
      );

    // Realtime necesita el token de la sesión para aplicar RLS.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel.subscribe();
    });

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [projectId, router]);

  return null;
}
