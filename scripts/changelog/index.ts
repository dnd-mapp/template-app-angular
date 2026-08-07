#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'node:fs';
import { bumpChangelog, extractSection, isUnreleasedEmpty, UNRELEASED_EMPTY_MESSAGE } from './lib.ts';

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
 * @param timeZone - The IANA timezone to compute the date in, e.g. `Europe/Amsterdam` or `UTC`.
 * @returns Today's date in `YYYY-MM-DD` format, per `timeZone`'s wall clock.
 * @throws {RangeError} If `timeZone` isn't a recognized IANA timezone name.
 */
function today(timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: 'year' | 'month' | 'day'): string => {
        const found = parts.find((candidate) => candidate.type === type);

        if (!found) {
            throw new Error(`Intl.DateTimeFormat did not return a "${type}" part.`);
        }

        return found.value;
    };

    return `${part('year')}-${part('month')}-${part('day')}`;
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
    .option('-t, --timezone <tz>', 'IANA timezone to compute the release date in', 'Europe/Amsterdam')
    .action((version: string, repo: string, options: { timezone: string }) => {
        const result = tryCatch(() => {
            const releaseUrl = `https://github.com/${repo}/releases/tag/v${version}`;

            writeFileSync(CHANGELOG_PATH, bumpChangelog(readChangelog(), version, today(options.timezone), releaseUrl));
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
            program.error(UNRELEASED_EMPTY_MESSAGE);
        }
    });

if (process.argv.length === 2) {
    program.help();
}

program.parse(process.argv);
