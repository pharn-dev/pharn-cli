import type { BuildOptions } from 'esbuild';

// Types for scripts/build.mjs, so a test can import its options statically.

/** The esbuild options for the published bundle, written into `outdir`. */
export declare function buildOptions(outdir?: string): BuildOptions;
