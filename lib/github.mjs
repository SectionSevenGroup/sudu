// The repository, seen from the server.
//
// Control never writes to main. Every edit lands on one long-lived draft
// branch with one open pull request, which Netlify builds as a deploy preview.
// Publishing means merging that pull request; nothing else touches production.
import { publicError, redactSecrets } from './public-error.mjs';

const API = 'https://api.github.com';

export function client(env) {
  const owner = env.SUDU_GITHUB_OWNER || 'SectionSevenGroup';
  const repo = env.SUDU_GITHUB_REPO || 'sudu';
  const base = env.SUDU_GITHUB_BASE || 'main';
  const draft = env.SUDU_GITHUB_DRAFT || 'control/draft';
  const site = env.SUDU_NETLIFY_SITE || 'sudustudioarchitecture';

  async function call(path, options = {}) {
    const res = await fetch(API + path, {
      ...options,
      signal: options.signal || AbortSignal.timeout(10000),
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + env.GITHUB_TOKEN,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'sudu-control',
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      // Deliberately not a public error. GitHub's own wording is for the
      // function log; the browser is told something Control chose to say.
      const err = new Error((data && data.message) || `GitHub returned ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const R = `/repos/${owner}/${repo}`;
  const previewContext = `netlify/${site}/deploy-preview`;
  const enc = (b) => encodeURIComponent(b);

  const refSha = async (branch) => (await call(`${R}/git/ref/heads/${enc(branch)}`)).object.sha;

  async function ensureDraft() {
    try { return await refSha(draft); }
    catch (e) {
      if (e.status !== 404) throw e;
      const sha = await refSha(base);
      await call(`${R}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${draft}`, sha }) });
      return sha;
    }
  }

  // Where the draft actually is, and — in one specific case — moving it first.
  //
  // A draft that carries no Control commits but sits behind main is not a
  // conflict: there is nothing on it to preserve. Left alone it would serve
  // stale copies of files someone else changed to the editor, who would then
  // save that stale text forward. So it is fast-forwarded onto main before
  // anything is read from it. This is a real fast-forward — the draft is a
  // strict ancestor of main — so force stays false and no history is rewritten.
  //
  // A draft with work on it is never touched here, however far behind it is.
  // That is a conflict, and it belongs to reconcile().
  async function resolveDraft() {
    const sha = await ensureDraft();
    const cmp = await call(`${R}/compare/${enc(base)}...${enc(draft)}`);
    if (cmp.ahead_by > 0 || !(cmp.behind_by > 0)) return sha;
    const main = await refSha(base);
    await call(`${R}/git/refs/heads/${enc(draft)}`, {
      method: 'PATCH', body: JSON.stringify({ sha: main, force: false }),
    });
    return main;
  }

  async function getFile(path, ref = draft) {
    const f = await call(`${R}/contents/${path.split('/').map(enc).join('/')}?ref=${enc(ref)}`);
    return { text: Buffer.from(String(f.content || '').replace(/\n/g, ''), 'base64').toString('utf8'), sha: f.sha };
  }

  // One commit per save, built through the git data API so several files move
  // together and the branch tip only advances if it is still where we left it.
  async function commit(files, message, expectedParent) {
    const parent = await ensureDraft();
    if (expectedParent && parent !== expectedParent) {
      throw publicError('The draft moved while you were editing.', 409, 'draft-moved');
    }
    const parentCommit = await call(`${R}/git/commits/${parent}`);
    const tree = [];
    for (const f of files) {
      const blob = await call(`${R}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: f.content, encoding: f.encoding || 'utf-8' }),
      });
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const newTree = await call(`${R}/git/trees`, {
      method: 'POST', body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree }),
    });
    const made = await call(`${R}/git/commits`, {
      method: 'POST', body: JSON.stringify({ message, tree: newTree.sha, parents: [parent] }),
    });
    // force stays false: a fast-forward or nothing, never over someone's work
    await call(`${R}/git/refs/heads/${enc(draft)}`, {
      method: 'PATCH', body: JSON.stringify({ sha: made.sha, force: false }),
    });
    return made.sha;
  }

  const openPR = async () => {
    const list = await call(`${R}/pulls?state=open&head=${enc(owner + ':' + draft)}&base=${enc(base)}&per_page=5`);
    return list[0] || null;
  };

  async function ensurePR() {
    const existing = await openPR();
    if (existing) return existing;
    return call(`${R}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'SuDu Control — content updates',
        head: draft,
        base,
        body: 'Edits made in SuDu Control. Review the deploy preview, then publish from Control.',
      }),
    });
  }

  // behind_by is the whole of conflict safety: if main has moved since the
  // draft branched, publishing would carry stale copies of files someone else
  // changed. Control refuses and says so rather than resolving it silently.
  //
  // Everything below describes ONE commit. The draft is resolved to a SHA
  // first and every question is then asked of that SHA — how it compares to
  // main, which files it touches, whether its preview built. Asking the
  // branch name instead would let a save land between two of the questions
  // and produce an answer that was never true of any single commit.
  async function state() {
    const head = await resolveDraft();
    const cmp = await call(`${R}/compare/${enc(base)}...${enc(head)}`);
    // Opening the review pull request is a separate GitHub permission from
    // committing, so it can fail on its own with the draft already written.
    // That is not a reason to fail the whole request: the draft is real and
    // the editor needs to see it. Every read of state retries the creation,
    // so a permission that is granted later heals the draft on the next look.
    let pr = null;
    let review = 'none';
    if (cmp.ahead_by > 0) {
      try {
        pr = await ensurePR();
        review = 'ready';
      } catch (e) {
        console.error('control: review pull request could not be opened',
          e && e.status ? e.status : '', redactSecrets(e && e.message, env));
        pr = await openPR().catch(() => null);
        review = pr ? 'ready' : 'failed';
      }
    } else {
      pr = await openPR().catch(() => null);
      review = pr ? 'ready' : 'none';
    }
    let deploy = null;
    if (pr) {
      const combined = await call(`${R}/commits/${head}/status`);
      // Only this exact context may open publishing. A green production
      // deploy, or any other Netlify check that happens to be passing, says
      // nothing about whether the draft itself builds.
      const found = (combined.statuses || []).find((s) => s.context === previewContext);
      deploy = {
        context: previewContext,
        state: found ? found.state : 'pending',
        url: found && found.state === 'success' ? found.target_url : null,
        description: found ? found.description : 'Waiting for the preview build to start.',
      };
    }
    return {
      headSha: head,
      // 'none'   nothing is waiting, so no review is needed
      // 'ready'  the draft has an open pull request Netlify can build
      // 'failed' the draft exists but its review could not be opened
      review,
      hasChanges: cmp.ahead_by > 0,
      aheadBy: cmp.ahead_by || 0,
      behindBy: cmp.behind_by || 0,
      files: (cmp.files || []).map((f) => f.filename),
      pr: pr ? { number: pr.number, url: pr.html_url } : null,
      deploy,
      canPublish: Boolean(pr && cmp.ahead_by > 0 && cmp.behind_by === 0 && deploy && deploy.state === 'success'),
    };
  }

  const moved = () => publicError(
    'The draft changed after its preview was checked. Review the new preview before publishing.', 409);

  async function publish() {
    const s = await state();
    if (!s.hasChanges) throw publicError('There is nothing to publish.', 409);
    if (s.behindBy > 0) throw publicError('The site changed after this draft was started. Reconcile it before publishing.', 409);
    if (!s.deploy || s.deploy.state !== 'success') throw publicError('The preview is not ready, so there is nothing verified to publish.', 409);
    // The draft may have moved since its preview was checked. Saying so is
    // kinder than letting GitHub's refusal stand in for the explanation, but
    // it is not the protection — the merge below is.
    if (await refSha(draft) !== s.headSha) throw moved();
    let merged;
    try {
      merged = await call(`${R}/pulls/${s.pr.number}/merge`, {
        method: 'PUT',
        // s.headSha, never a fresh read. This is the commit whose preview was
        // verified, and GitHub rejects the merge if the branch has moved off
        // it since — the last defence if it moves between the check above and
        // this request.
        body: JSON.stringify({ merge_method: 'merge', sha: s.headSha, commit_title: 'Publish SuDu Control changes' }),
      });
    } catch (e) {
      // 409 from this endpoint means exactly one thing: the head is no longer
      // the SHA we asked to merge. Control's own sentence, not GitHub's.
      if (e && e.status === 409) throw moved();
      throw e;
    }
    // GitHub's refusal is its own sentence and may name anything at all, so
    // it is logged rather than repeated. What the editor needs to know is
    // that the merge did not happen and that nothing else moved.
    if (!merged.merged) {
      console.error('control: merge refused', redactSecrets(merged && merged.message, env));
      throw publicError('GitHub did not merge the draft. Nothing else was changed.', 409);
    }
    // The branch still points at the head that was just merged. Left there,
    // the next edit would start from a commit that is now behind main and the
    // editor would be told to reconcile before they had changed anything.
    // Move it onto the merge commit so the draft and the site are level.
    await call(`${R}/git/refs/heads/${enc(draft)}`, {
      method: 'PATCH', body: JSON.stringify({ sha: merged.sha, force: false }),
    });
    return { merged: true, sha: merged.sha };
  }

  // Bring the draft up to date with main by merging main into it — never by
  // rewriting the branch, which would discard whatever else is on it.
  async function reconcile() {
    await call(`${R}/merges`, {
      method: 'POST',
      body: JSON.stringify({ base: draft, head: base, commit_message: 'Bring the Control draft up to date with the site' }),
    });
    return state();
  }

  // Deleting a file needs its blob sha, and the branch tip must still be where
  // the caller read it — the same expected-parent rule every other write obeys.
  async function deleteFile(path, message, expectedParent) {
    const parent = await ensureDraft();
    if (expectedParent && parent !== expectedParent) {
      throw publicError('The draft moved while you were editing.', 409, 'draft-moved');
    }
    const f = await call(`${R}/contents/${path.split('/').map(enc).join('/')}?ref=${enc(draft)}`);
    const out = await call(`${R}/contents/${path.split('/').map(enc).join('/')}`, {
      method: 'DELETE',
      body: JSON.stringify({ message, sha: f.sha, branch: draft }),
    });
    return out.commit ? out.commit.sha : null;
  }

  async function listMedia(dir = 'images') {
    const items = await call(`${R}/contents/${enc(dir)}?ref=${enc(draft)}`);
    return (Array.isArray(items) ? items : [])
      .filter((f) => f.type === 'file')
      .map((f) => ({ path: `${dir}/${f.name}`, name: f.name, size: f.size }));
  }

  return { owner, repo, base, draft, site, call, refSha, ensureDraft, resolveDraft, getFile, commit, deleteFile, openPR, ensurePR, state, publish, reconcile, listMedia };
}
