"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

/**
 * El servidor no sabe qué tema tiene el navegador, así que todo lo que depende del tema
 * (ícono y texto accesible) se resuelve con CSS (`dark:`) y no con estado: así el HTML del
 * servidor y el del cliente coinciden.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="size-4 dark:hidden" aria-hidden />
      <Moon className="hidden size-4 dark:block" aria-hidden />
      <span className="sr-only dark:hidden">Cambiar a modo oscuro</span>
      <span className="sr-only hidden dark:block">Cambiar a modo claro</span>
    </Button>
  );
}
