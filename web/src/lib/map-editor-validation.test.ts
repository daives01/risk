import { expect, test } from "bun:test";
import { buildMapEditorValidation, type EditorGraphMap } from "./map-editor-validation";

function validate(graph: EditorGraphMap) {
  return buildMapEditorValidation({
    graphForPersist: graph,
    imageStorageId: null,
    imageWidth: 100,
    imageHeight: 100,
    nodeScale: 1,
    anchors: { a: { x: 0, y: 0 }, b: { x: 1, y: 1 } },
    territories: graph.territories,
    continents: graph.continents ?? {},
    territoryToContinents: { a: ["north"], b: ["north"] },
  });
}

test("editor validation retains unknown references for engine diagnostics without mutation", () => {
  const graph: EditorGraphMap = {
    territories: { a: {}, b: {} },
    adjacency: { a: ["b", "missing"], b: ["a"] },
    continents: { north: { territoryIds: ["a", "b", "missing"], bonus: 2 } },
  };
  const before = structuredClone(graph);
  const result = validate(graph);
  expect(result.errors).toContain('Territory "a" is adjacent to unknown territory "missing"');
  expect(result.errors).toContain('Continent "north" references unknown territory "missing"');
  expect(graph).toEqual(before);
});

test("editor validation accepts connected graph data with omitted continents", () => {
  const result = validate({ territories: { a: {}, b: {} }, adjacency: { a: ["b"], b: ["a"] } });
  expect(result.errors).toEqual([]);
  expect(result.warnings).toEqual([]);
});
