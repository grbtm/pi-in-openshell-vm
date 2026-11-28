# ADR 0003: Read-only network access for packages, code, docs and web search

- **Status:** Accepted. Two checks are open (see "Open tests"). [ADR 0004](0004-git-host.md) lets Git in the VM fetch from and push to one repo on GitHub.

## Context

Besides its model provider, a sandbox needs packages (npm, PyPI), code and docs from the web, and web search for real work.

Every allowed host is a way out for data (README, "Security model"). Even a `GET` carries data in its URL. Whether that matters depends on the host: data is at risk where an attacker can read the requests (their own GitHub repo's traffic, PyPI's public download statistics, which include a User-Agent the VM sets, an API call made with their token), or where the host fetches a URL it is given. Content also comes in: anyone can publish on GitHub, npm and PyPI, and change it at any time, so pages and packages can carry instructions for Pi.

Pi has no search tool, and its docs recommend none. Its maintainers add search with small skills: a script plus a `SKILL.md` that Pi reads when needed, such as `brave-search` in [pi-skills](https://github.com/badlogic/pi-skills). Built-in search through the model provider was declined ([pi#709](https://github.com/earendil-works/pi/issues/709)). Every reliable search API needs an account with payment details.

OpenShell restricts each rule to programs, and with `protocol: rest` to HTTP methods and paths (not request bodies). A rule also applies to every process a listed program starts. Pi runs commands through bash, and `node` and Python run any code, so in practice a rule for them is a rule for any code in the VM.

## Decision

1. **Read-only for every host, with three exceptions:** the model provider, one search path (decision 4), and Git fetches and pushes to the sandbox's own repo ([ADR 0004](0004-git-host.md)). Read-only means `protocol: rest`, `access: read-only` (`GET`, `HEAD`, `OPTIONS`), `enforcement: enforce`.
2. **The hosts are listed in `policy.yaml`,** with the programs that may reach them. A host is added there, without changing this ADR, if it passes this test: nobody else can publish there and see the requests, and the host doesn't fetch URLs it is given.
3. **Other hosts per sandbox, by hand:** `docs/security.md` shows one `openshell policy update` command that adds a read-only rule for one host to one sandbox. It lasts until the sandbox is deleted. OpenShell's drafts are not used: it drafts a rule for every blocked connection, without method restrictions. The one-time setup pins their approval to manual for the whole gateway (the VM can't approve), and the docs say never to approve them.
4. **Web search is optional:** the provider `kagi` and its client, a skill in this repo (`pi-agent/skills/kagi-search`). The skill is in every image, in Pi's skills folder (`/var/lib/pi-agent/skills/kagi-search`), and works once the provider is added; a sandbox without the provider has no web search. It is an optional integration ([ADR 0006](0006-personal-pi-config.md), "Context").
   - Search: a short Node script sends `POST https://kagi.com/api/v1/search` with a JSON body of only `query` and `limit` ([Kagi Search API](https://kagi.com/api/docs/openapi)), and prints title, URL and snippet per result.
   - The key is an OpenShell provider, `kagi`, like Scaleway's: the VM sees a placeholder in `KAGI_API_KEY`, and OpenShell's supervisor puts the real key into `Authorization: Bearer …` only for that path. The provider's only rule is `POST /api/v1/search` on `kagi.com`, for `node`. Kagi's other endpoints, which fetch any URL server-side (`/api/v1/extract`, `/api/v0/summarize`), stay blocked.
   - In Kagi's API portal, the key is limited to the Search product, and the account gets a low usage limit.
   - Reading pages: a second script fetches a page from the VM and converts it to Markdown, adapted from `brave-search`'s `content.js` (MIT). It reaches only the hosts allowed above.
5. **Pi is told the rules:** the image installs `pi-agent/sandbox-context.md` as Pi's global context file. It says: no `git clone` of other repos (use `codeload.github.com` tarballs), Python packages into a virtual environment, web search through the skill, and a blocked host means asking the user, not working around it.

## Consequences

- **No `git clone` or `git push` in the VM,** except for the sandbox's own repo (ADR 0004). Git over HTTPS sends a `POST` even for cloning. Other repos come in as tarballs (`curl -L https://codeload.github.com/OWNER/REPO/tar.gz/REF | tar xz`) and from the registries; packages that depend on Git URLs don't install.
- **What still leaves:** whatever a `GET` carries, to hosts where an attacker can read it: requests to their own repo or release, their package's download statistics, or GitHub API calls made with their token, which the VM can send. Decision 2's test rules out, for example, `*.github.io` and `*.substack.com`.
- **Search queries leave too,** to Kagi and tied to your account. OpenShell checks only method and path, not the body, so code in the VM can also set fields the script doesn't: `extract` makes Kagi fetch the result pages, and `personalizations` can rewrite result URLs with regexes. If Kagi fetches rewritten URLs, the search endpoint can fetch any URL after all. The Search-only key may or may not block that; the usage limit caps it either way.
- **Searches cost money,** billed per search. Code in the VM can spend it up to the usage limit. Code in the VM can also send its own Kagi key, which OpenShell passes through unchanged, and search on someone else's account.
- **Content from the web is untrusted:** pages, search results and packages can carry prompt injection. Package installs run code in the VM, which already assumes untrusted content (ADR 0001).
- **Lockfiles come back in Pi's branches:** a changed `package-lock.json` or `requirements.txt` is part of the diff you review. Check the hosts and packages in it, and install on the Mac with `npm ci --ignore-scripts` or not at all. Private registries are out of scope.
- **Stricter than a domain allowlist:** rules restrict methods and paths, the GitHub token stays with OpenShell, is used only by Git, and fetches and pushes only the sandbox's own repo (ADR 0004), and hosts allowed for one sandbox don't carry over to another.

## Options not chosen

- **`brave-search` from pi-skills with the Brave Search API:** the same shape, but it needs a separate Brave account with a credit card on file.
- **Kagi's hosted MCP server** (`mcp.kagi.com/mcp`, which Pi's built-in MCP client could use): it also offers `kagi_extract`, which fetches any URL. OpenShell's `protocol: mcp` can limit calls by tool name, but Pi's MCP client also sends a `GET` and a `DELETE` that the rules would have to admit, and this needs an `mcp.json` and more testing than one REST path.
- **Kagi's local MCP server (`kagimcp`):** a Python and `uv` stack in the VM, and it also offers `kagi_extract`.
- **Scraping a search results page** (DuckDuckGo, or Brave as `brave-search` once did): no key, but it can break without notice. `brave-search` moved to the API after rate limits (HTTP 429).
- **Self-hosted SearXNG on the Mac:** no key, but a new service on the Mac that the VM can reach, and it scrapes search engines underneath.
- **[pi-web-access](https://github.com/nicobailon/pi-web-access):** large and fast-changing. Its keyless default, Exa's hosted MCP server, uses `POST`, and it clones GitHub repos.
- **Search through the model provider** (OpenAI's or Anthropic's server-side search): needs one of those providers (see [ADR 0005](0005-anthropic-provider.md)), and Pi doesn't support it.
- **Hosted page fetchers** (Jina Reader, Exa crawling): they fetch any URL on their own servers, around the allowed hosts.
- **Allowing `POST` to GitHub's `…/git-upload-pack` for `git clone` of any repo:** another exception for a convenience that tarballs cover. ADR 0004 allows it for the sandbox's own repo only.
- **A `pi-sandbox allow` command:** safe input checks and conflict handling for something used rarely; a command in `docs/security.md` does the same.

## Open tests

- A search with `extract` and a `personalizations` regex that rewrites results to a URL you control: if Kagi fetches it, `docs/security.md` and "Search queries leave too" must say that search can fetch any URL.
- `read.mjs` fails cleanly when a page redirects to a blocked host.
