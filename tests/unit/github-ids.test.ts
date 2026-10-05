import { describe, expect, it } from "vitest";

import { extractIds, linksFor } from "@/lib/github/ids";

describe("parser de IDs (PLAN.md §10.3)", () => {
  it("encuentra BOB-14 en la rama, el commit y el título", () => {
    expect(extractIds("bob-14-slice-1c", "BOB", "branch")).toEqual(["BOB-14"]);
    expect(extractIds("BOB-14 aplica los 4 archivos", "BOB", "commit")).toEqual(
      ["BOB-14"],
    );
    expect(extractIds("Slice 1c (BOB-14)", "BOB", "pr_title")).toEqual([
      "BOB-14",
    ]);
  });

  it("ignora bob14, ABCDEF-1 y BOB- sin número", () => {
    expect(extractIds("bob14 sin guion", "BOB", "commit")).toEqual([]);
    expect(extractIds("bob14", "BOB", "branch")).toEqual([]);
    expect(
      extractIds("ABCDEF-1 es demasiado largo", "ABCDE", "commit"),
    ).toEqual([]);
    expect(extractIds("BOB- falta el número", "BOB", "commit")).toEqual([]);
  });

  it("en commits y PRs distingue mayúsculas (bob-14 en un mensaje no cuenta)", () => {
    expect(extractIds("arregla bob-14", "BOB", "commit")).toEqual([]);
  });

  it("solo vincula el prefijo del proyecto dueño del repo", () => {
    expect(extractIds("BOB-14 y MOM-3", "BOB", "commit")).toEqual(["BOB-14"]);
    expect(extractIds("MOM-3", "BOB", "pr_body")).toEqual([]);
  });

  it("varios IDs, sin repetir, normaliza ceros a la izquierda", () => {
    expect(
      extractIds("BOB-14, BOB-15 y otra vez BOB-14; BOB-007", "BOB", "pr_body"),
    ).toEqual(["BOB-14", "BOB-15", "BOB-7"]);
  });

  it("linksFor guarda dónde apareció primero cada ID", () => {
    const links = linksFor("BOB", [
      { source: "branch", text: "bob-14-slice" },
      { source: "pr_title", text: "BOB-14 y BOB-16" },
      { source: "pr_body", text: "Cierra BOB-17" },
    ]);
    expect([...links]).toEqual([
      ["BOB-14", "branch"],
      ["BOB-16", "pr_title"],
      ["BOB-17", "pr_body"],
    ]);
  });
});
