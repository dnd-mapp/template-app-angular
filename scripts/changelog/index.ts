#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'node:fs';
import { bumpChangelog, extractSection, isUnreleasedEmpty } from './lib.ts';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Runs `fn` and returns its outcome as a value instead of throwing, so callers can handle failure
 * without a `try`/`catch` block of their own.
 *
 * @typeParam T - The type `fn` returns on success.
 * @param fn - The function to invoke.
 * @returns `{ ok: true, value }` if `fn` returned normally, or `{ ok: false, error }` (`error` being the
 * caught error's message, or its stringified form if it wasn't an `Error`) if `fn` threw.
 */
function tryCatch<T>(fn: () => T): Result<T> {
    try {
        return { ok: true, value: fn() };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}

const CHANGELOG_PATH = 'CHANGELOG.md';

/**
 * @returns Today's date in `YYYY-MM-DD` format, per the system clock.
 */
function today(): string {
    return new Date().toISOString().slice(0, 10);
}

/**
 * @returns The contents of `CHANGELOG.md` in the current working directory.
 */
function readChangelog(): string {
    return readFileSync(CHANGELOG_PATH, 'utf8');
}

const program = new Command('changelog').description('Keep a Changelog release automation.');

/**
 * `bump` command handler: reads `CHANGELOG.md`, moves Unreleased's entries into a new dated version
 * section via {@link bumpChangelog}, and writes the result back to disk. Reports failure through
 * `program.error` instead of throwing.
 */
program
    .command('bump')
    .description('Move Unreleased entries into a new dated version section.')
    .argument('<version>', 'version being released, e.g. 1.2.0')
    .argument('<repo>', 'GitHub owner/repo slug the release link points at, e.g. dnd-mapp/template-app-angular')
    .action((version: string, repo: string) => {
        const result = tryCatch(() => {
            const releaseUrl = `https://github.com/${repo}/releases/tag/v${version}`;

            writeFileSync(CHANGELOG_PATH, bumpChangelog(readChangelog(), version, today(), releaseUrl));
        });

        if (!result.ok) {
            program.error(result.error);
        }
    });

/**
 * `extract` command handler: reads `CHANGELOG.md` and prints the requested version's section body
 * (via {@link extractSection}) to stdout. Reports failure through `program.error` instead of throwing.
 */
program
    .command('extract')
    .description("Print a version section's body, for use as GitHub Release notes.")
    .argument('<version>', 'version to extract, e.g. 1.2.0')
    .action((version: string) => {
        const result = tryCatch(() => extractSection(readChangelog(), version));

        if (!result.ok) {
            program.error(result.error);

            return;
        }

        process.stdout.write(result.value);
    });

/**
 * `check` command handler: reads `CHANGELOG.md` and exits non-zero via `program.error` if Unreleased has
 * no entries (per {@link isUnreleasedEmpty}), so a release workflow can guard against releasing nothing.
 */
program
    .command('check')
    .description('Exit non-zero if Unreleased has no entries.')
    .action(() => {
        const result = tryCatch(() => isUnreleasedEmpty(readChangelog()));

        if (!result.ok) {
            program.error(result.error);
        } else if (result.value) {
            program.error('The "Unreleased" section has no entries. Nothing to release.');
        }
    });

if (process.argv.length === 2) {
    program.help();
}

program.parse(process.argv);
