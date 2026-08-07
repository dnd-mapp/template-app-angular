#!/usr/bin/env node
import { Command, InvalidArgumentError } from 'commander';
import { readFileSync, writeFileSync } from 'node:fs';
import {
    bumpChangelog,
    extractSection,
    findUnrecognizedHeadings,
    isUnreleasedEmpty,
    UNRELEASED_EMPTY_MESSAGE,
} from './lib.ts';

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
 * Checks whether a caught value is a Node.js filesystem error carrying an error `code`, e.g. `ENOENT`.
 *
 * @param error - The caught value to check.
 * @returns `true` if `error` is an `Error` with a `code` property; narrows the type to `NodeJS.ErrnoException`.
 */
function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error;
}

/**
 * @returns The contents of `CHANGELOG.md` in the current working directory.
 * @throws {Error} With a message naming the missing file, if `CHANGELOG.md` doesn't exist in the current
 * working directory. Any other read failure (e.g. a permissions error) is rethrown as-is.
 */
function readChangelog(): string {
    try {
        return readFileSync(CHANGELOG_PATH, 'utf8');
    } catch (error) {
        if (isErrnoException(error) && error.code === 'ENOENT') {
            throw new Error(`No ${CHANGELOG_PATH} found in the current working directory.`, { cause: error });
        }

        throw error;
    }
}

const REPO_SLUG = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/;

/**
 * Commander argument parser for `<repo>`: validates it looks like a GitHub `owner/repo` slug before it's
 * interpolated into the release URL written to `CHANGELOG.md`, so a malformed value (e.g. containing `]`
 * or whitespace) is rejected up front instead of silently producing a broken Markdown link.
 *
 * @param value - The raw `<repo>` argument as passed on the command line.
 * @returns `value` unchanged, once validated.
 * @throws {InvalidArgumentError} If `value` doesn't look like an `owner/repo` slug.
 */
function parseRepoSlug(value: string): string {
    if (!REPO_SLUG.test(value)) {
        throw new InvalidArgumentError('must be a GitHub "owner/repo" slug, e.g. dnd-mapp/template-app-angular.');
    }

    return value;
}

/**
 * Prints a warning to stderr for every unrecognized `### ` heading in Unreleased that has entries under
 * it (per {@link findUnrecognizedHeadings}), since {@link bumpChangelog} and {@link isUnreleasedEmpty}
 * silently drop those entries rather than failing outright.
 *
 * @param content - The full changelog file contents.
 */
function warnUnrecognizedHeadings(content: string): void {
    findUnrecognizedHeadings(content).forEach((heading) => {
        console.error(
            `Warning: "### ${heading}" is not a recognized Keep a Changelog heading; its entries will be dropped.`,
        );
    });
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
    .argument(
        '<repo>',
        'GitHub owner/repo slug the release link points at, e.g. dnd-mapp/template-app-angular',
        parseRepoSlug,
    )
    .option('-t, --timezone <tz>', 'IANA timezone to compute the release date in', 'Europe/Amsterdam')
    .action((version: string, repo: string, options: { timezone: string }) => {
        const result = tryCatch(() => {
            const content = readChangelog();

            warnUnrecognizedHeadings(content);

            const releaseUrl = `https://github.com/${repo}/releases/tag/v${version}`;

            writeFileSync(CHANGELOG_PATH, bumpChangelog(content, version, today(options.timezone), releaseUrl));
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
        const result = tryCatch(() => {
            const content = readChangelog();

            warnUnrecognizedHeadings(content);

            return isUnreleasedEmpty(content);
        });

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
