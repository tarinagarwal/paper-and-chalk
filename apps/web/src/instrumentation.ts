/** Runs once when the server starts. Invalid env stops the process instead of serving errors. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    await import("./env");
  } catch (error) {
    console.error("Refusing to start: environment is invalid.", error);
    process.exit(1);
  }
}
