# Azure resources — a Claude Code mod

A pane beside the chat that shows the Azure resources your project uses, as cards grouped in one tab per
resource type (Container Apps, App Service, Foundry, Storage, …). Each card shows the key fields of its
type (URL, state, revision, replicas, SKU, region, resource group…) and, on demand, all its properties.

It is **read-only**: it never changes anything in Azure, and secrets (keys, connection strings, tokens)
are never shown.

By Fabio Santini.

## How it works

- **Recording.** When Claude runs an `az` command in your session (Bash or PowerShell), the mod notes the
  resources that command touched in `azure.md`, in the session's working folder.
- **Update** (`/azure-update` or the Update button) reads `azure.md` and refreshes every card from Azure
  with `az resource show`.
- **Scan** (`/azure-scan` or the Scan button) starts a dedicated, restricted Claude agent that finds the
  resource groups your project uses — by reading the project's files (CLAUDE.md, README, Bicep,
  Terraform, CI/CD workflows, `azure.md`) and, if you configure it, your memory MCP — and then lists their
  resources with `az resource list`. The results are added to `azure.md` and shown as cards.
- Each card has **Refresh** and **All properties**.

## Requirements

- Claude Code with mod support (built and tested on 2.1.330), terminal or desktop app.
- The [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli), signed in by you
  (`az login`). The mod uses your own login and never signs in for you.

## Install

At the prompt of a terminal session:

```
/plugin install azure-resources --marketplace FabioSantini/claude-azure-resources
```

Answer `y` to add the marketplace, then pick a scope (user scope = every session).

From a shell:

```
claude plugin install azure-resources --marketplace FabioSantini/claude-azure-resources
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**,
**Add marketplace** with `FabioSantini/claude-azure-resources`, then **Add plugin**.

## Options

Set during install (or later in the plugin settings):

| option | default | what it is |
|---|---|---|
| `azPython` | `C:\Program Files\Microsoft SDKs\Azure\CLI2\python.exe` | The Python bundled with the Azure CLI. The mod runs `python -IBm azure.cli` directly, without a shell. On Linux or macOS, set it to the Python your `az` launcher script runs (open the `az` script to see it; e.g. `/opt/az/bin/python3` on many Linux installs). |
| `refreshParallel` | `4` | How many resources are refreshed at the same time (1–8). |
| `memoryTools` | empty | Optional. Comma-separated names of **read-only** MCP tools the Scan agent may call to search your project memory, e.g. `mcp__my-memory__memory_search,mcp__my-memory__memory_list`. Only names that look read-only are accepted (search, list, get, read, find, query, recall, view…); names with write verbs or with secret/key/token/password in them are dropped; at most 5. |

## Security

- **Read-only Azure calls.** The mod itself runs only `az resource show --ids <ARM id>`,
  `az resource list` and `az account show`. The Scan agent may run, one per call and in this exact form
  only: `az resource list -g <group> -o json`, `az group list -o json`, `az account show -o json` — no
  quotes, pipes or other programs. Any other command is refused.
- **Secrets are filtered** from everything shown: known secret keys and patterns (passwords, account
  keys, SAS signatures, JWTs, credentials in URLs, long opaque blobs) are replaced before display, and
  `systemData` (who created the resource) is hidden.
- **The Scan agent** has only Bash (the az allow-list above), Read, Glob, the report tool and your
  optional memory tools. No Grep, no writing, no other tools.
  - Read opens only `.md .txt .bicep .tf .yml .yaml .json .ps1 .sh .toml`, `Dockerfile` and `Makefile`,
    only inside the project folder (checked on the real path, after links are resolved), and never
    `.env*`, keys, certificates, `*.tfstate`, `*.tfvars`, `appsettings*.json`, credential files, or
    anything under `.git .azure .ssh .aws .kube .docker .gnupg .config .claude vault secrets node_modules`.
  - A scan is refused in your home folder, a folder above it, a drive or share root, or inside one of
    those secret folders.
  - The agent can only report resources that its own `az resource list` returned during that scan; their
    name, type and group are taken from the resource id, so text read from files cannot reach `azure.md`.
- **Known limits.**
  - A file swapped for a link in the instant between the check and the read, or a hard link, is not
    caught.
  - Glob shows the agent file *names* in the project, secret ones included (never their contents).
  - Allowed files (for example `docker-compose.yml`) may still contain secrets the agent can read; they
    have no way out of the agent, but avoid scanning projects you do not trust.
  - Project folders on network shares, under WSL paths or with `~` short names: every file read of the
    Scan is refused (safe, but the scan then relies on `azure.md` and memory only).
  - `memoryTools` are trusted by name: list only tools you know are read-only.
- `azure.md` holds resource ids and names, no secrets. Decide yourself whether to commit it.

## Development

```
claude plugin validate .
claude plugin test .
```

## License

MIT — see [LICENSE](LICENSE).
