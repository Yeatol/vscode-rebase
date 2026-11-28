# Git Quick Actions

[![Visual Studio Marketplace Version](https://vsmarketplacebadges.dev/version/Yeatol.git-quick-actions.svg)](https://marketplace.visualstudio.com/items?itemName=Yeatol.git-quick-actions)

Git Quick Actions for the Source Control Manager.

| Action | Description |
|---|---|
| **Commit&nbsp;Amend** | `git commit --amend --no-edit` |
| **Commit&nbsp;Undo** | `git reset --soft HEAD~1` |
| **Interactive&nbsp;Rebase** | `commits.length > 100 ? git rebase -i HEAD~100 : git rebase -i --root` |
| **Force&nbsp;Pull** | `git fetch --prune`, `git checkout main`, `git branch -D <other-branches>`, `git reset --keep <remote>/main` |
| **Force&nbsp;Push** | `git push --force-with-lease <remote> <remote-branch>` |
| **Reset&nbsp;Keep** | `git reset --keep <remote>/<branch>` |
