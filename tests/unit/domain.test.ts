import { describe, expect, it } from "vitest";

import { dueLabel, relativeAge, turnInfo } from "@/lib/relevo/domain";

const now = new Date("2026-10-05T12:00:00Z");

describe("relativeAge", () => {
  it("usa minutos, horas y días en español", () => {
    expect(relativeAge("2026-10-05T11:30:00Z", now)).toBe("hace 30 minutos");
    expect(relativeAge("2026-10-05T09:00:00Z", now)).toBe("hace 3 horas");
    expect(relativeAge("2026-09-10T12:00:00Z", now)).toBe("hace 25 días");
  });
  it("pasados 30 días muestra la fecha corta", () => {
    expect(relativeAge("2026-08-01T12:00:00Z", now)).toMatch(/^1 ago/);
  });
});

describe("dueLabel", () => {
  it("cuenta los días que faltan", () => {
    expect(dueLabel("2026-10-08", now)).toEqual({
      text: "Vence 8 oct · dentro de 3 días",
      overdue: false,
    });
    expect(dueLabel("2026-10-05", now).text).toBe("Vence 5 oct · hoy");
  });
  it("marca lo vencido", () => {
    expect(dueLabel("2026-10-02", now)).toEqual({
      text: "Venció 2 oct",
      overdue: true,
    });
  });
});

describe("turnInfo", () => {
  const profiles = new Map([
    ["u1", { id: "u1", display_name: "Henry", turn_color: "#2E4FD0" }],
  ]);
  it("persona con su nombre y color", () => {
    expect(
      turnInfo(
        { turn: "persona", turn_user_id: "u1", turn_third_party: null },
        profiles,
      ),
    ).toEqual({
      kind: "persona",
      userId: "u1",
      name: "Henry",
      color: "#2E4FD0",
    });
  });
  it("tercero con nombre", () => {
    expect(
      turnInfo(
        {
          turn: "tercero",
          turn_user_id: null,
          turn_third_party: "platform team",
        },
        profiles,
      ),
    ).toMatchObject({ kind: "tercero", name: "platform team" });
  });
  it("nadie cuando está cerrada", () => {
    expect(
      turnInfo(
        { turn: "nadie", turn_user_id: null, turn_third_party: null },
        profiles,
      ).kind,
    ).toBe("nadie");
  });
});
