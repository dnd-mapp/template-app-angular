import { bumpChangelog, extractSection, findUnrecognizedHeadings, isUnreleasedEmpty } from './lib.ts';

const PREAMBLE = `# Changelog

All notable, consumer-facing changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
`;

const REPO_URL = 'https://github.com/dnd-mapp/template-app-angular';

function changelog(unreleasedBody: string, ...priorSections: string[]): string {
    return [
        PREAMBLE,
        '## [Unreleased]',
        '',
        ...(unreleasedBody ? [unreleasedBody, ''] : []),
        ...priorSections,
        `[Unreleased]: ${REPO_URL}/commits/main`,
    ].join('\n');
}

describe('isUnreleasedEmpty', () => {
    it('is true when Unreleased has no category headings at all', () => {
        expect(isUnreleasedEmpty(changelog(''))).toBe(true);
    });

    it('is true when a category heading is present but has no entries under it', () => {
        const content = changelog('### Added\n');

        expect(isUnreleasedEmpty(content)).toBe(true);
    });

    it('is false when at least one entry exists under any heading', () => {
        const content = changelog('### Fixed\n\n- Fixed a bug.\n');

        expect(isUnreleasedEmpty(content)).toBe(false);
    });

    it('throws when no "## [Unreleased]" section exists', () => {
        expect(() => isUnreleasedEmpty(PREAMBLE)).toThrow('No "## [Unreleased]" section found.');
    });

    it('is true when only an unrecognized heading has entries', () => {
        const content = changelog('### NotARealHeading\n\n- Something.\n');

        expect(isUnreleasedEmpty(content)).toBe(true);
    });
});

describe('bumpChangelog', () => {
    it('throws when Unreleased has no entries to release', () => {
        expect(() => bumpChangelog(changelog(''), '1.0.0', '2026-08-10', 'https://example.com')).toThrow(
            'The "Unreleased" section has no entries to release.',
        );
    });

    it('moves entries into a new dated version section', () => {
        const content = changelog('### Added\n\n- Added a widget.\n');

        const result = bumpChangelog(content, '1.0.0', '2026-08-10', `${REPO_URL}/releases/tag/v1.0.0`);

        expect(result).toContain('## [1.0.0] - 2026-08-10\n\n### Added\n\n- Added a widget.');
    });

    it('preserves the source heading order instead of re-sorting to the canonical order', () => {
        const content = changelog('### Fixed\n\n- Fixed a bug.\n\n### Added\n\n- Added a widget.\n');

        const result = bumpChangelog(content, '1.0.0', '2026-08-10', 'https://example.com');
        const fixedIndex = result.indexOf('### Fixed');
        const addedIndex = result.indexOf('### Added');

        expect(fixedIndex).toBeGreaterThan(-1);
        expect(fixedIndex).toBeLessThan(addedIndex);
    });

    it('drops headings that have no entries under them', () => {
        const content = changelog('### Deprecated\n\n### Added\n\n- Added a widget.\n');

        const result = bumpChangelog(content, '1.0.0', '2026-08-10', 'https://example.com');

        expect(result).not.toContain('### Deprecated');
    });

    it('resets Unreleased to fully bare, with no leftover category headings', () => {
        const content = changelog('### Added\n\n- Added a widget.\n');

        const result = bumpChangelog(content, '1.0.0', '2026-08-10', 'https://example.com');

        expect(result).toContain('## [Unreleased]\n\n## [1.0.0]');
    });

    it('inserts the new release link directly after the Unreleased link, above any older ones', () => {
        const content = changelog(
            '### Added\n\n- Added a widget.\n',
            '## [1.0.0] - 2026-01-01\n\n### Added\n\n- Added the first widget.\n',
        ).replace(
            `[Unreleased]: ${REPO_URL}/commits/main`,
            `[Unreleased]: ${REPO_URL}/commits/main\n[1.0.0]: ${REPO_URL}/releases/tag/v1.0.0`,
        );

        const result = bumpChangelog(content, '1.1.0', '2026-08-10', `${REPO_URL}/releases/tag/v1.1.0`);
        const lines = result.trimEnd().split('\n');

        expect(lines.at(-3)).toBe(`[Unreleased]: ${REPO_URL}/commits/main`);
        expect(lines.at(-2)).toBe(`[1.1.0]: ${REPO_URL}/releases/tag/v1.1.0`);
        expect(lines.at(-1)).toBe(`[1.0.0]: ${REPO_URL}/releases/tag/v1.0.0`);
    });

    it('drops entries under an unrecognized heading', () => {
        const content = changelog('### NotARealHeading\n\n- Something.\n\n### Added\n\n- Added a widget.\n');

        const result = bumpChangelog(content, '1.0.0', '2026-08-10', 'https://example.com');

        expect(result).not.toContain('NotARealHeading');
        expect(result).not.toContain('Something.');
    });

    it('throws when no "[Unreleased]" reference link exists to insert the new link after', () => {
        const content = changelog('### Added\n\n- Added a widget.\n').replace(
            `[Unreleased]: ${REPO_URL}/commits/main`,
            '',
        );

        expect(() => bumpChangelog(content, '1.0.0', '2026-08-10', 'https://example.com')).toThrow(
            'No "[Unreleased]" reference link found.',
        );
    });

    it('keeps prior version sections below the newly inserted one', () => {
        const content = changelog(
            '### Added\n\n- Added a widget.\n',
            '## [1.0.0] - 2026-01-01\n\n### Added\n\n- Added the first widget.\n',
        );

        const result = bumpChangelog(content, '1.1.0', '2026-08-10', 'https://example.com');
        const newIndex = result.indexOf('## [1.1.0]');
        const oldIndex = result.indexOf('## [1.0.0]');

        expect(newIndex).toBeGreaterThan(-1);
        expect(newIndex).toBeLessThan(oldIndex);
    });
});

describe('multi-line and nested entries', () => {
    it('keeps a wrapped continuation line as part of its entry when bumping', () => {
        const content = changelog(
            '### Added\n\n- Added a widget with a description that\n  wraps onto a second line.\n',
        );

        const result = bumpChangelog(content, '1.0.0', '2026-08-10', 'https://example.com');

        expect(result).toContain('### Added\n\n- Added a widget with a description that\n  wraps onto a second line.');
    });

    it('keeps a nested sub-list as part of its entry when bumping', () => {
        const content = changelog(
            '### Changed\n\n- Changed the widget API:\n  - Renamed `foo` to `bar`.\n  - Removed `baz`.\n',
        );

        const result = bumpChangelog(content, '1.0.0', '2026-08-10', 'https://example.com');

        expect(result).toContain(
            '### Changed\n\n- Changed the widget API:\n  - Renamed `foo` to `bar`.\n  - Removed `baz`.',
        );
    });

    it('keeps a blank line inside a loose, multi-paragraph entry, trimming only the trailing one', () => {
        const content = changelog('### Added\n\n- Added a widget.\n\n  A second paragraph for the same entry.\n');

        const result = bumpChangelog(content, '1.0.0', '2026-08-10', 'https://example.com');

        expect(result).toContain('### Added\n\n- Added a widget.\n\n  A second paragraph for the same entry.');
    });

    it('treats a subsequent top-level "- " line as a separate entry, not a continuation', () => {
        const content = changelog(
            '### Added\n\n- Added a widget with a description that\n  wraps onto a second line.\n- Added a second, unrelated widget.\n',
        );

        const result = bumpChangelog(content, '1.0.0', '2026-08-10', 'https://example.com');

        expect(result).toContain(
            '### Added\n\n- Added a widget with a description that\n  wraps onto a second line.\n- Added a second, unrelated widget.',
        );
    });

    it('ends an entry at an unindented line that is not a new list item, dropping the stray line', () => {
        const content = changelog('### Added\n\n- Added a widget.\nStray unindented line.\n- Added another widget.\n');

        const result = bumpChangelog(content, '1.0.0', '2026-08-10', 'https://example.com');

        expect(result).toContain('### Added\n\n- Added a widget.\n- Added another widget.');
        expect(result).not.toContain('Stray unindented line.');
    });

    it('is true when a category has only indented non-list text and no "- " entries', () => {
        const content = changelog('### Added\n\n  Just some indented text, not a list item.\n');

        expect(isUnreleasedEmpty(content)).toBe(true);
    });
});

describe('findUnrecognizedHeadings', () => {
    it('is empty when every heading is a recognized one', () => {
        const content = changelog('### Added\n\n- Added a widget.\n\n### Fixed\n\n- Fixed a bug.\n');

        expect(findUnrecognizedHeadings(content)).toEqual([]);
    });

    it('is empty when an unrecognized heading has no entries under it', () => {
        const content = changelog('### NotARealHeading\n');

        expect(findUnrecognizedHeadings(content)).toEqual([]);
    });

    it('names an unrecognized heading that has at least one entry under it', () => {
        const content = changelog('### NotARealHeading\n\n- Something.\n');

        expect(findUnrecognizedHeadings(content)).toEqual(['NotARealHeading']);
    });

    it('names each distinct unrecognized heading once, in source order', () => {
        const content = changelog(
            '### NotARealHeading\n\n- Something.\n\n### Added\n\n- Added a widget.\n\n### AlsoNotReal\n\n- Another.\n\n### NotARealHeading\n\n- More.\n',
        );

        expect(findUnrecognizedHeadings(content)).toEqual(['NotARealHeading', 'AlsoNotReal']);
    });

    it('throws when no "## [Unreleased]" section exists', () => {
        expect(() => findUnrecognizedHeadings(PREAMBLE)).toThrow('No "## [Unreleased]" section found.');
    });
});

describe('extractSection', () => {
    it('extracts a version section body without its heading line', () => {
        const content = changelog(
            '### Added\n\n- Added a widget.\n',
            '## [1.0.0] - 2026-01-01\n\n### Added\n\n- Added the first widget.\n',
        );

        expect(extractSection(content, '1.0.0')).toBe('### Added\n\n- Added the first widget.\n');
    });

    it('throws when the requested version section does not exist', () => {
        const content = changelog('### Added\n\n- Added a widget.\n');

        expect(() => extractSection(content, '9.9.9')).toThrow('No "## [9.9.9]" section found.');
    });

    it('extracts a section that runs to the end of the file, with no reference links after it', () => {
        const content = `${PREAMBLE}\n## [1.0.0] - 2026-01-01\n\n### Added\n\n- Added a widget.\n`;

        expect(extractSection(content, '1.0.0')).toBe('### Added\n\n- Added a widget.\n');
    });
});
