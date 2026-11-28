import * as vscode from "vscode";

enum GitForcePushMode {
  Force = 0,
  ForceWithLease = 1,
  ForceWithLeaseIfIncludes = 2
}

interface GitBranch {
  readonly name?: string;
}

interface GitRepository {
  readonly state: {
    readonly HEAD?: {
      readonly name?: string;
      readonly commit?: string;
      readonly upstream?: {
        readonly remote: string;
        readonly name: string;
      };
    };
    readonly remotes: readonly {
      readonly name: string;
    }[];
    readonly indexChanges: readonly unknown[];
    readonly workingTreeChanges?: readonly unknown[];
    readonly mergeChanges?: readonly unknown[];
    readonly untrackedChanges?: readonly unknown[];
  };
  fetch(options: { remote?: string; prune?: boolean }): Promise<void>;
  getBranches(query: { remote?: boolean }): Promise<GitBranch[]>;
  log(options?: { maxEntries?: number }): Promise<readonly unknown[]>;
  checkout(treeish: string): Promise<void>;
  deleteBranch(name: string, force?: boolean): Promise<void>;
  resetKeep(ref: string): Promise<void>;
  push(
    remoteName?: string,
    branchName?: string,
    setUpstream?: boolean,
    force?: GitForcePushMode
  ): Promise<void>;
  commit(message: string, opts?: {
    amend?: boolean;
    useEditor?: boolean;
    all?: boolean | "tracked";
  }): Promise<void>;
}

function showMessage(command: string, message: string): void {
  void vscode.window.setStatusBarMessage(`${command} - ${message}`, 3000);
}

function getGitRepository(
  provider: { readonly rootUri: vscode.Uri }
): GitRepository | null {
  const gitExtension = vscode.extensions.getExtension<{
    getAPI(version: 1): {
      getRepository(uri: vscode.Uri): GitRepository | null;
    };
  }>("vscode.git");

  return gitExtension?.exports
    .getAPI(1)
    .getRepository(provider.rootUri) ?? null;
}

async function gitCommitAmend(
  provider: { readonly rootUri: vscode.Uri }
): Promise<void> {
  const repository = getGitRepository(provider);
  if (!repository) {
    showMessage("Git.CommitAmend", "Not a Git repository");
    return;
  }

  if (!repository.state.HEAD?.commit) {
    showMessage("Git.CommitAmend", "HEAD is unavailable");
    return;
  }

  const indexChanges = repository.state.indexChanges;
  const workingTreeChanges = repository.state.workingTreeChanges ?? [];
  const mergeChanges = repository.state.mergeChanges ?? [];
  const untrackedChanges = repository.state.untrackedChanges ?? [];
  const hasStagedChanges = indexChanges.length > 0;
  const noStagedChanges = !hasStagedChanges;

  let all: true | "tracked" | false = false;
  if (noStagedChanges) {
    all = workingTreeChanges.length > 0 ||
      mergeChanges.length > 0 ||
      untrackedChanges.length > 0
      ? true
      : false;
  }

  if (!hasStagedChanges && all === false) {
    showMessage("Git.CommitAmend", "No changes");
    return;
  }

  await repository.commit("", {
    amend: true,
    useEditor: false,
    all
  });
}

async function gitCommitUndo(
  provider: { readonly rootUri: vscode.Uri }
): Promise<void> {
  await vscode.commands.executeCommand<void>("git.undoCommit", provider);
}

async function gitRebaseInteractive(
  provider: { readonly rootUri: vscode.Uri }
): Promise<void> {
  const repository = getGitRepository(provider);
  if (!repository) {
    showMessage("Git.RebaseInteractive", "Not a Git repository");
    return;
  }

  if (!repository.state.HEAD?.commit) {
    showMessage("Git.RebaseInteractive", "HEAD is unavailable");
    return;
  }

  const commits = await repository.log({ maxEntries: 101 });
  const target = commits.length > 100
    ? "HEAD~100"
    : "--root";

  const workspacePath = provider.rootUri.fsPath.replace(/"/g, '\\"');
  const terminal =
    vscode.window.terminals.find(
      item => item.name === "Interactive Rebase"
    ) ??
    vscode.window.createTerminal({
      name: "Interactive Rebase",
      cwd: provider.rootUri
    });
  terminal.show(true);
  terminal.sendText(`git -C "${workspacePath}" rebase -i ${target}`);
}

async function gitForcePull(
  provider: { readonly rootUri: vscode.Uri }
): Promise<void> {
  const repository = getGitRepository(provider);
  if (!repository) {
    showMessage("Git.ForcePull", "Not a Git repository");
    return;
  }

  const head = repository.state.HEAD;
  const remotes = repository.state.remotes;
  if (remotes.length !== 1) {
    showMessage("Git.ForcePull", "Remote count is not 1");
    return;
  }

  const remoteName = remotes[0].name;

  try {
    await repository.fetch({ remote: remoteName, prune: true });
  } catch {
    showMessage("Git.ForcePull", "Fetch failed");
    return;
  }

  const defaultBranch = "main";

  if (head?.name !== defaultBranch) {
    await repository.checkout(defaultBranch);
  }

  const localBranches = await repository.getBranches({ remote: false });
  for (const branch of localBranches) {
    if (branch.name && branch.name !== defaultBranch) {
      await repository.deleteBranch(branch.name, true);
    }
  }

  await repository.resetKeep(`${remoteName}/${defaultBranch}`);
}

async function gitForcePush(
  provider: { readonly rootUri: vscode.Uri }
): Promise<void> {
  const repository = getGitRepository(provider);
  if (!repository) {
    showMessage("Git.ForcePush", "Not a Git repository");
    return;
  }

  const remotes = repository.state.remotes;
  if (remotes.length !== 1) {
    showMessage("Git.ForcePush", "Remote count is not 1");
    return;
  }

  const remoteName = remotes[0].name;
  const head = repository.state.HEAD;
  const upstream = head?.upstream;
  if (!head?.name) {
    showMessage("Git.ForcePush", "HEAD is unavailable");
    return;
  }

  if (!upstream) {
    showMessage("Git.ForcePush", "No upstream");
    return;
  }

  if (upstream.remote !== remoteName) {
    showMessage("Git.ForcePush", "Upstream remote mismatch");
    return;
  }

  if (head.name !== upstream.name) {
    showMessage("Git.ForcePush", "Branch names mismatch");
    return;
  }

  try {
    await repository.push(
      remoteName,
      upstream.name,
      false,
      GitForcePushMode.ForceWithLease
    );
  } catch {
    showMessage("Git.ForcePush", "Push Failed");
  }
}

async function gitResetKeep(
  provider: { readonly rootUri: vscode.Uri }
): Promise<void> {
  const repository = getGitRepository(provider);
  if (!repository) {
    showMessage("Git.ResetKeep", "Not a Git repository");
    return;
  }

  const head = repository.state.HEAD;
  if (!head?.name) {
    showMessage("Git.ResetKeep", "HEAD is unavailable");
    return;
  }

  const upstream = head.upstream;
  if (!upstream) {
    showMessage("Git.ResetKeep", "No upstream");
    return;
  }

  await repository.resetKeep(
    `${upstream.remote}/${upstream.name}`
  );
}

export function activate(context: vscode.ExtensionContext): void {
  const commitAmendDisposable = vscode.commands.registerCommand(
    "Git.CommitAmend",
    (provider: { readonly rootUri: vscode.Uri }) =>
      gitCommitAmend(provider)
  );
  const commitUndoDisposable =
    vscode.commands.registerCommand(
      "Git.CommitUndo",
      (provider: { readonly rootUri: vscode.Uri }) =>
        gitCommitUndo(provider)
    );
  const rebaseInteractiveDisposable = vscode.commands.registerCommand(
    "Git.RebaseInteractive",
    (provider: { readonly rootUri: vscode.Uri }) =>
      gitRebaseInteractive(provider)
  );
  const forcePullDisposable = vscode.commands.registerCommand(
    "Git.ForcePull",
    (provider: { readonly rootUri: vscode.Uri }) =>
      gitForcePull(provider)
  );
  const forcePushDisposable = vscode.commands.registerCommand(
    "Git.ForcePush",
    (provider: { readonly rootUri: vscode.Uri }) =>
      gitForcePush(provider)
  );
  const resetDisposable = vscode.commands.registerCommand(
    "Git.ResetKeep",
    (provider: { readonly rootUri: vscode.Uri }) =>
      gitResetKeep(provider)
  );
  context.subscriptions.push(
    commitAmendDisposable,
    commitUndoDisposable,
    rebaseInteractiveDisposable,
    forcePullDisposable,
    forcePushDisposable,
    resetDisposable
  );
}

export function deactivate(): void {}
