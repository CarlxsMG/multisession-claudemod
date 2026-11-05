# Releasing crew

How a maintainer cuts a version. Users install from the default branch through the marketplace,
so a release is a tagged point on `main` with its notes, and the `version` in the manifest is what
Claude Code shows.

## Choose the version

crew follows [Semantic Versioning](https://semver.org/). Before 1.0:

- a fix only: bump the patch (`0.1.0` to `0.1.1`);
- anything else: bump the minor (`0.1.1` to `0.2.0`).

A change that makes stored data or share codes unreadable is never released: see
CONTRIBUTING.md, What must never change.

## Steps

1. **Start from a green `main`.** Pull, and check that CI passed on the last commit.
2. **Bump the version** in `.claude-plugin/plugin.json`.
3. **Update CHANGELOG.md.** Move the entries under `## [Unreleased]` to a new
   `## [X.Y.Z] - YYYY-MM-DD` section, dated the day of the release, grouped as Added, Changed,
   Fixed or Removed, written for users. Add the compare links at the bottom:

   ```
   [Unreleased]: https://github.com/CarlxsMG/multisession-claudemod/compare/vX.Y.Z...HEAD
   [X.Y.Z]: https://github.com/CarlxsMG/multisession-claudemod/compare/vPREVIOUS...vX.Y.Z
   ```

4. **Run the checks** where the engine's types are laid (see CONTRIBUTING.md, Setup):

   ```
   claude plugin validate --strict --profile directory .
   claude plugin test .
   npx -p typescript tsc -p .
   ```

5. **Commit and merge** the bump through a pull request titled `Release X.Y.Z`, labelled
   `ignore-for-release`, so it stays out of the generated notes.
6. **Tag the merge commit** and push the tag:

   ```
   git switch main && git pull
   git tag -a vX.Y.Z -m "crew X.Y.Z"
   git push origin vX.Y.Z
   ```

7. **Check CI on the tag's commit**, then **publish the GitHub release**: title `crew X.Y.Z`,
   with the CHANGELOG section as its body. `gh release create vX.Y.Z --notes-file <the section>`
   does it; `--generate-notes` adds the pull requests, grouped by label (`.github/release.yml`).
8. **Try the release** in a session: `/plugin marketplace update`, then update crew from
   `/plugin`, and open `/crew`.

## If something went wrong

Do not move or delete a published tag. Fix forward with a patch release.
