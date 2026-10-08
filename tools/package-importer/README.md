# Safe package import

This tool imports only the files listed in `../PACKAGE_MANIFEST.json` from `../repo`. Keep those paths together. It requires Node.js and Git. It does not fetch, create branches, reset, stash, commit, merge, push, run package scripts, or contact a remote service.

By default the package root is the script's parent directory. An archived copy kept in the repository can point to a separately extracted package with `--package-root`:

```text
node tools/package-importer/apply-package.mjs --package-root "FULL PATH TO EXTRACTED CONTINUATION PACKAGE" --target "FULL PATH TO YOUR AUXILIUMOS CLONE"
```

The explicit package root must contain `PACKAGE_MANIFEST.json` and `repo`. Add `--apply` only after reviewing preflight. Supply the same `--package-root` when recovering an import performed through an archived script copy.

Use your existing clone of `AuxiliumEnvironmental/auxiliumos`. The clone must contain the package's source commit, and that commit must be an ancestor of your current branch. A newer checkout is supported when the files being replaced still match their recorded baseline. Divergent files cause the whole import to stop without changing any target file.

1. Save any current work in your normal Git workflow. Close other writers to this checkout while importing.
2. Create or switch to a dedicated working branch. `--apply` refuses `main`, `master`, and detached HEAD.
3. From this package's outer directory, inspect the planned changes:

   ```text
   node package-tools/apply-package.mjs --target "FULL PATH TO YOUR AUXILIUMOS CLONE"
   ```

4. If preflight reports the intended repository and no conflicts, import:

   ```text
   node package-tools/apply-package.mjs --target "FULL PATH TO YOUR AUXILIUMOS CLONE" --apply
   ```

5. Review the resulting Git diff, run the documented package/repository checks, then commit and push through the normal review workflow. A successful import does not mean the code has been committed, pushed, merged, deployed, or synchronized to another computer.

An exact repeat is a no-op, including when the only uncommitted files are exactly the already-imported package. Other dirty or staged content is refused. Unrelated committed files remain unchanged. The importer preserves existing target-file permission modes and creates new files with mode `0644`.

## Interrupted imports

The importer writes verified backups and a durable journal under the Git metadata directory at `auxiliumos-package-imports`. Ordinary failures trigger rollback. A terminated process leaves an active journal, and later imports stop until recovery.

After ensuring the original importer is no longer running, use the same package and checkout:

```text
node package-tools/apply-package.mjs --target "FULL PATH TO YOUR AUXILIUMOS CLONE" --recover
```

Recovery first checks the original branch/HEAD, journal, backups, and every affected file. It restores only this import's changes. If newer edits or a different branch/HEAD are present, it refuses recovery instead of overwriting them. Preserve that newer work and reconcile it using the retained journal/backups. Do not delete the journal to bypass a conflict. Completed and rolled-back journals remain locally available in Git metadata; they are not automatically uploaded to GitHub.

This is a single-writer file transaction with per-file atomic replacement and recoverable interruption. It is not a filesystem-wide atomic transaction, and other tools must not edit or switch branches in the same checkout while it runs. No importer can guarantee durability against hardware failure or external destructive commands.

## Verification

Run the isolated fixture tests without modifying the project:

```text
node --test package-tools/tests/apply-package.test.mjs
```

The tests create temporary Git repositories and cover dry runs, import/no-op, preservation of newer unrelated code, target collisions, payload corruption, unsafe paths/symlinks, wrong origin, branch and ancestry checks, dirty/staged changes, failure rollback, actual process interruption, and conflict-preserving recovery. They do not use the network or real client records.
