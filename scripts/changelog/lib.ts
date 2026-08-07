const CHANGE_HEADINGS = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'] as const;

type ChangeHeading = (typeof CHANGE_HEADINGS)[number];

interface CategoryBlock {
    heading: ChangeHeading;
    entries: string[];
}

const SECTION_HEADING = /^## \[Unreleased\]$/m;
const SECTION_BOUNDARY = /^(?:## |\[[^\]]+\]: )/m;
const CATEGORY_HEADING = /^### (\w+)$/gm;
const UNRELEASED_LINK = /^\[Unreleased\]: .*$/m;
const ENTRY_CONTINUATION = /^\s/;

/**
 * Checks whether a string is one of the six Keep a Changelog category headings
 * (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`).
 *
 * @param value - The heading text to check, without the `### ` prefix.
 * @returns `true` if `value` is a recognized change heading; narrows the type to `ChangeHeading` when it is.
 */
function isChangeHeading(value: string): value is ChangeHeading {
    return (CHANGE_HEADINGS as readonly string[]).includes(value);
}

/**
 * Escapes regular expression metacharacters in a string so it can be embedded literally inside a `RegExp` pattern.
 *
 * @param value - The raw string to escape (e.g. a version number that may contain `.` characters).
 * @returns `value` with every regex metacharacter preceded by a backslash.
 */
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Locates the body of a `## [...]` section given the index right after its heading line.
 *
 * The body runs from `headingEnd` up to (but not including) whichever comes first: the next `## ` section
 * heading, or the start of the reference-links block at the bottom of the file (a `[label]: url` line).
 *
 * @param content - The full changelog file contents.
 * @param headingEnd - The index immediately after the section's heading line (before its trailing newline).
 * @returns The `[bodyStart, bodyEnd)` character range of the section's body within `content`.
 */
function sectionBody(content: string, headingEnd: number): { bodyStart: number; bodyEnd: number } {
    const rest = content.slice(headingEnd);
    const boundary = SECTION_BOUNDARY.exec(rest);
    const bodyEnd = boundary ? headingEnd + boundary.index : content.length;

    return { bodyStart: headingEnd, bodyEnd };
}

/**
 * Locates the body of the `## [Unreleased]` section.
 *
 * @param content - The full changelog file contents.
 * @returns The `[bodyStart, bodyEnd)` character range of the Unreleased section's body within `content`.
 * @throws {Error} If no `## [Unreleased]` heading is found in `content`.
 */
function findUnreleasedSection(content: string): { bodyStart: number; bodyEnd: number } {
    const heading = SECTION_HEADING.exec(content);

    if (!heading) {
        throw new Error('No "## [Unreleased]" section found.');
    }

    return sectionBody(content, heading.index + heading[0].length);
}

/**
 * Locates the body of a specific version's `## [<version>]` section, with or without its trailing
 * ` - YYYY-MM-DD` date suffix.
 *
 * @param content - The full changelog file contents.
 * @param version - The unprefixed version to look for, e.g. `1.2.0`.
 * @returns The `[bodyStart, bodyEnd)` character range of the version section's body within `content`.
 * @throws {Error} If no `## [<version>]` heading is found in `content`.
 */
function findVersionSection(content: string, version: string): { bodyStart: number; bodyEnd: number } {
    const heading = new RegExp(`^## \\[${escapeRegExp(version)}\\](?: - \\d{4}-\\d{2}-\\d{2})?$`, 'm').exec(content);

    if (!heading) {
        throw new Error(`No "## [${version}]" section found.`);
    }

    return sectionBody(content, heading.index + heading[0].length);
}

/**
 * Splits a category block's raw text into its individual `- ` entries, each entry carrying along any
 * indented continuation lines that follow it (wrapped paragraph text, or a nested sub-list) up to the
 * next top-level `- ` entry or the end of the block.
 *
 * A blank line does not by itself end an entry, since Markdown allows a blank line inside a loose list
 * item; blank lines trailing the last continuation line are trimmed off before the entry is kept.
 *
 * @param text - The raw text under a `### <Heading>` line, as sliced by {@link parseCategories}.
 * @returns Each entry's full text (its `- ` line plus any continuation lines), in source order.
 */
function parseEntries(text: string): string[] {
    const entries: string[] = [];
    let current: string[] = [];

    const flush = (): void => {
        if (current.length === 0) {
            return;
        }

        entries.push(current.join('\n').replace(/\n+$/, ''));
        current = [];
    };

    text.split('\n').forEach((line) => {
        if (line.startsWith('- ')) {
            flush();
            current.push(line);
        } else if (current.length > 0 && (line === '' || ENTRY_CONTINUATION.test(line))) {
            current.push(line);
        } else {
            flush();
        }
    });
    flush();

    return entries;
}

/**
 * Parses a section body into its category blocks, preserving the order the `### <Heading>` lines
 * appear in rather than re-sorting to the canonical Keep a Changelog order.
 *
 * Headings outside the six recognized categories are left untouched rather than rejected: by the time
 * this runs, an unrecognized heading is already a convention violation upstream, not this script's job
 * to police. A recognized heading with zero entries under it is dropped entirely, since there is nothing
 * to carry forward for it.
 *
 * @param body - The raw text of a section body, as returned by {@link sectionBody}.
 * @returns The category blocks found in `body`, each with at least one entry, in source order.
 */
function parseCategories(body: string): CategoryBlock[] {
    const blocks: CategoryBlock[] = [];
    const headings = [...body.matchAll(CATEGORY_HEADING)];

    headings.forEach((heading, index) => {
        const name = heading[1];

        if (!name || !isChangeHeading(name)) {
            return;
        }

        // headings[index + 1]'s presence is guaranteed by the bounds check just before it; TypeScript can't
        // prove that from a numeric comparison, so asserting here avoids a branch that can never be taken.
        const start = heading.index + heading[0].length;
        const end = index + 1 < headings.length ? headings[index + 1]!.index : body.length;
        const entries = parseEntries(body.slice(start, end));

        if (entries.length > 0) {
            blocks.push({ heading: name, entries });
        }
    });

    return blocks;
}

/**
 * Checks whether the `## [Unreleased]` section has no entries under any of the six category headings.
 *
 * A heading with no entries under it still counts as empty; only actual entries count.
 *
 * @param content - The full changelog file contents.
 * @returns `true` if Unreleased has zero entries anywhere, `false` if it has at least one.
 * @throws {Error} If no `## [Unreleased]` heading is found in `content`.
 */
export function isUnreleasedEmpty(content: string): boolean {
    const { bodyStart, bodyEnd } = findUnreleasedSection(content);

    return parseCategories(content.slice(bodyStart, bodyEnd)).length === 0;
}

/**
 * Moves every entry out of `## [Unreleased]` into a new, dated `## [<version>]` section directly below it,
 * leaving Unreleased fully bare, and inserts the new version's reference-style link directly after the
 * `[Unreleased]` link at the bottom of the file.
 *
 * @param content - The full changelog file contents.
 * @param version - The unprefixed version being released, e.g. `1.2.0`.
 * @param date - The release date in `YYYY-MM-DD` format.
 * @param releaseUrl - The URL the new version's reference-style link should point at.
 * @returns The full changelog file contents with the new version section inserted and Unreleased emptied.
 * @throws {Error} If no `## [Unreleased]` heading is found, if Unreleased has no entries to release,
 * or if no `[Unreleased]` reference link is found to insert the new link after.
 */
export function bumpChangelog(content: string, version: string, date: string, releaseUrl: string): string {
    const { bodyStart, bodyEnd } = findUnreleasedSection(content);
    const categories = parseCategories(content.slice(bodyStart, bodyEnd));

    if (categories.length === 0) {
        throw new Error('The "Unreleased" section has no entries to release.');
    }

    const categoryBlocks = categories.map((category) => `### ${category.heading}\n\n${category.entries.join('\n')}`);
    const versionSection = [`## [${version}] - ${date}`, ...categoryBlocks].join('\n\n');

    const before = content.slice(0, bodyStart);
    const after = content.slice(bodyEnd);
    const bumped = `${before}\n\n${versionSection}\n\n${after}`;

    const unreleasedLink = UNRELEASED_LINK.exec(bumped);

    if (!unreleasedLink) {
        throw new Error('No "[Unreleased]" reference link found.');
    }

    const insertAt = unreleasedLink.index + unreleasedLink[0].length;

    return `${bumped.slice(0, insertAt)}\n[${version}]: ${releaseUrl}${bumped.slice(insertAt)}`;
}

/**
 * Extracts a version section's body (its category headings and entries), without the `## [<version>]`
 * heading line itself, for reuse as GitHub Release notes.
 *
 * @param content - The full changelog file contents.
 * @param version - The unprefixed version to extract, e.g. `1.2.0`.
 * @returns The section body, trimmed of surrounding blank lines, with a single trailing newline.
 * @throws {Error} If no `## [<version>]` heading is found in `content`.
 */
export function extractSection(content: string, version: string): string {
    const { bodyStart, bodyEnd } = findVersionSection(content, version);

    return `${content.slice(bodyStart, bodyEnd).trim()}\n`;
}
