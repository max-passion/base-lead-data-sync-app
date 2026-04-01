function planDistribution(files, targets, options = {}) {
  const strictEvenDistribution = options.strictEvenDistribution !== false;
  const maxFilesPerBatch = Number.isInteger(options.maxFilesPerBatch)
    ? options.maxFilesPerBatch
    : files.length;

  if (!Array.isArray(files) || files.length === 0) {
    return {
      assignments: [],
      deferredFiles: []
    };
  }

  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error("At least one target is required for distribution.");
  }

  const targetCount = targets.length;
  const limitedFiles = files.slice(0, Math.max(0, maxFilesPerBatch));

  let filesToAssign = limitedFiles;
  if (strictEvenDistribution && targetCount > 1) {
    const divisibleCount = limitedFiles.length - (limitedFiles.length % targetCount);
    filesToAssign = limitedFiles.slice(0, divisibleCount);
  }

  const assignments = [];
  filesToAssign.forEach((file, index) => {
    assignments.push({
      file,
      target: targets[index % targetCount]
    });
  });

  const assignedNames = new Set(assignments.map((item) => item.file.path));
  const deferredFiles = files.filter((file) => !assignedNames.has(file.path));

  return {
    assignments,
    deferredFiles
  };
}

module.exports = {
  planDistribution
};
