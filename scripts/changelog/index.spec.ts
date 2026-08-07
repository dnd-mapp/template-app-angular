import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI_PATH = fileURLToPath(new URL('./index.ts', import.meta.url));
const CHANGELOG_PATH = 'CHANGELOG.md';

const dirs: string[] = [];

/**
 * Creates a fresh temp directory containing a `CHANGELOG.md` with the given content, so each test gets
 * its own isolated "repo root" to run the CLI against.
 *
 * @param content - The full `CHANGELOG.md` contents to seed the temp directory with.
 * @returns The temp directory's absolute path.
 */
function tempRepo(content: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'changelog-cli-'));

    writeFileSync(join(dir, CHANGELOG_PATH), content);
    dirs.push(dir);

    return dir;
}

/**
 * Spawns the CLI as a real subprocess (rather than importing `index.ts` in-process), since the module
 * calls `program.parse` and can call `process.exit` as a side effect of being loaded.
 *
 * @param args - The CLI arguments, e.g. `['check']` or `['bump', '1.0.0', 'acme/repo']`.
 * @param cwd - The working directory to run the CLI in, so `CHANGELOG.md` resolves relative to it.
 * @returns The completed subprocess result, with `stdout`/`stderr` as strings.
 */
function runCli(args: string[], cwd: string): SpawnSyncReturns<string> {
    return spawnSync(process.execPath, [CLI_PATH, ...args], { cwd, encoding: 'utf8' });
}

afterEach(() => {
    dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe('no arguments', () => {
    it('prints help and exits 0', () => {
        const result = runCli([], tempRepo('## [Unreleased]\n\n[Unreleased]: https://example.com/commits/main\n'));

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Usage: changelog');
        expect(result.stdout).toContain('bump <version> <repo>');
    });
});

describe('check', () => {
    it('exits 0 silently when Unreleased has entries', () => {
        const dir = tempRepo(
            '## [Unreleased]\n\n### Added\n\n- Added a widget.\n\n[Unreleased]: https://example.com/commits/main\n',
        );

        const result = runCli(['check'], dir);

        expect(result.status).toBe(0);
        expect(result.stdout).toBe('');
        expect(result.stderr).toBe('');
    });

    it('exits 1 and reports when Unreleased has no entries', () => {
        const dir = tempRepo('## [Unreleased]\n\n[Unreleased]: https://example.com/commits/main\n');

        const result = runCli(['check'], dir);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('The "Unreleased" section has no entries. Nothing to release.');
    });

    it('exits 1 and reports when CHANGELOG.md is missing', () => {
        const dir = mkdtempSync(join(tmpdir(), 'changelog-cli-'));

        dirs.push(dir);

        const result = runCli(['check'], dir);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('CHANGELOG.md');
    });
});

describe('extract', () => {
    const content = [
        '## [Unreleased]',
        '',
        '[Unreleased]: https://example.com/commits/main',
        '[1.0.0]: https://example.com/releases/tag/v1.0.0',
    ].join('\n');
    const withVersion = content.replace(
        '## [Unreleased]\n',
        '## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n\n### Added\n\n- Added the first widget.\n',
    );

    it("prints the requested version's section body to stdout", () => {
        const result = runCli(['extract', '1.0.0'], tempRepo(withVersion));

        expect(result.status).toBe(0);
        expect(result.stdout).toBe('### Added\n\n- Added the first widget.\n');
        expect(result.stderr).toBe('');
    });

    it('exits 1 and reports when the version section does not exist', () => {
        const result = runCli(['extract', '9.9.9'], tempRepo(withVersion));

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('No "## [9.9.9]" section found.');
    });
});

describe('bump', () => {
    it('writes a new dated version section, resets Unreleased, and links the release on disk', () => {
        const dir = tempRepo(
            '## [Unreleased]\n\n### Added\n\n- Added a widget.\n\n[Unreleased]: https://example.com/commits/main\n',
        );

        const result = runCli(['bump', '1.0.0', 'acme/repo'], dir);
        const today = new Date().toISOString().slice(0, 10);
        const updated = readFileSync(join(dir, CHANGELOG_PATH), 'utf8');

        expect(result.status).toBe(0);
        expect(updated).toContain('## [Unreleased]\n\n## [1.0.0]');
        expect(updated).toContain(`## [1.0.0] - ${today}\n\n### Added\n\n- Added a widget.`);
        expect(updated).toContain('[1.0.0]: https://github.com/acme/repo/releases/tag/v1.0.0');
    });

    it('exits 1, reports, and leaves the file untouched when Unreleased has no entries', () => {
        const original = '## [Unreleased]\n\n[Unreleased]: https://example.com/commits/main\n';
        const dir = tempRepo(original);

        const result = runCli(['bump', '1.0.0', 'acme/repo'], dir);
        const untouched = readFileSync(join(dir, CHANGELOG_PATH), 'utf8');

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('The "Unreleased" section has no entries to release.');
        expect(untouched).toBe(original);
    });
});
