// Node runtime only: invalid env stops the process instead of serving errors.
try {
  await import("./env");
} catch (error) {
  console.error("Refusing to start: environment is invalid.", error);
  process.exit(1);
}
