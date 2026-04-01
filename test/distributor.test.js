const test = require("node:test");
const assert = require("node:assert/strict");
const { planDistribution } = require("../src/distributor");

function makeFiles(count) {
  return Array.from({ length: count }, (_, index) => ({
    name: `file-${index + 1}.txt`,
    path: `C:/tmp/file-${index + 1}.txt`
  }));
}

function makeTargets(count) {
  return Array.from({ length: count }, (_, index) => ({
    name: `vps-${index + 1}`,
    host: `203.0.113.${index + 10}`,
    remoteDir: "/incoming"
  }));
}

test("distributes evenly across all targets in strict mode", () => {
  const result = planDistribution(makeFiles(7), makeTargets(3), {
    strictEvenDistribution: true
  });

  assert.equal(result.assignments.length, 6);
  assert.equal(result.deferredFiles.length, 1);
  assert.deepEqual(
    result.assignments.map((item) => item.target.name),
    ["vps-1", "vps-2", "vps-3", "vps-1", "vps-2", "vps-3"]
  );
});

test("assigns every file when only one target exists", () => {
  const result = planDistribution(makeFiles(5), makeTargets(1), {
    strictEvenDistribution: true
  });

  assert.equal(result.assignments.length, 5);
  assert.equal(result.deferredFiles.length, 0);
});

test("respects maxFilesPerBatch before distributing", () => {
  const result = planDistribution(makeFiles(10), makeTargets(2), {
    strictEvenDistribution: true,
    maxFilesPerBatch: 4
  });

  assert.equal(result.assignments.length, 4);
  assert.equal(result.deferredFiles.length, 6);
});
