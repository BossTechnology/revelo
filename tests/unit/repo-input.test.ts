import { describe, expect, it } from "vitest";

import { parseRepoInput } from "@/lib/github/repo-input";

describe("conectar repo: organización/repo o URL de GitHub", () => {
  const bob = { owner: "BossTechnology", repo: "BOb-engine" };

  it("acepta org/repo y las URLs que se copian de GitHub", () => {
    for (const input of [
      "BossTechnology/BOb-engine",
      "  BossTechnology/BOb-engine  ",
      "https://github.com/BossTechnology/BOb-engine",
      "https://github.com/BossTechnology/BOb-engine/",
      "https://github.com/BossTechnology/BOb-engine.git",
      "github.com/BossTechnology/BOb-engine",
      "https://www.github.com/BossTechnology/BOb-engine/tree/main",
      "git@github.com:BossTechnology/BOb-engine.git",
    ]) {
      expect(parseRepoInput(input), input).toEqual(bob);
    }
  });

  it("rechaza lo que no es un repo", () => {
    for (const input of [
      "",
      "BOb-engine",
      "https://github.com/BossTechnology",
      "https://gitlab.com/BossTechnology/BOb-engine",
      "Boss Technology/BOb-engine",
    ]) {
      expect(parseRepoInput(input), input).toBeNull();
    }
  });
});
