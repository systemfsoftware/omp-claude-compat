import os from 'node:os'

/**
 * The one sanctioned `node:os` seam in this repo.
 *
 * `os.homedir()` has no Effect-service or web-standard replacement in the
 * dependency set (the Effect v4 rc platform packages ship no Os service), and
 * guessing from `process.env` would change behavior on non-POSIX hosts. Every
 * other module consumes this adapter, so the node:-import ban stays fully in
 * force on all real source — the oxlint config exempts exactly this file.
 *
 * @internal
 */
export const homeDir = (): string => os.homedir()
