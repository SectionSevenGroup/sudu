// A GitHub that lives in memory.
//
// Everything under api.github.com is stood in for, so the session, the content
// model, the publish gate and the function's own error handling are exercised
// for real while nothing leaves the machine and no credential is needed. Every
// request is recorded, so a test can assert not only what Control returned but
// what it asked GitHub to do.
import { readFileSync } from 'node:fs';

// Obvious fakes. Nothing here is, or resembles, a live value.
export const ENV = {
  GITHUB_TOKEN: 'ghp_this_is_not_a_real_token_0000000000',
  SUDU_CONTROL_PASSWORD: 'open sesame',
  SUDU_CONTROL_SESSION_SECRET: 'z'.repeat(48),
};

export const PREVIEW = 'netlify/sudustudioarchitecture/deploy-preview';

export function siteFiles() {
  return {
    'project.html': readFileSync(new URL('../project.html', import.meta.url), 'utf8'),
    'work.html': readFileSync(new URL('../work.html', import.meta.url), 'utf8'),
  };
}

export function mockGitHub(options = {}) {
  const repo = {
    files: options.files || siteFiles(),
    draft: null,
    mainSha: 'main0',
    draftSha: null,
    commits: [],
    pr: null,
    blobs: new Map(),
    trees: new Map(),
    n: 0,
    behind: options.behind || 0,
    merges: 0,
    // an array of {context, state}; the default is the one Control gates on
    statuses: options.statuses || [{ context: PREVIEW, state: options.deploy || 'pending' }],
    // when set, /merge answers {merged:false} with this wording
    mergeRefusal: options.mergeRefusal || null,
    images: options.images || [{ type: 'file', name: 'existing.jpg', size: 1234 }],
    // [{match, status, message}] or [{match, thrown}] — forces one failure each
    failures: [],
  };

  const calls = [];
  const draftFiles = () => {
    if (!repo.draft) { repo.draft = { ...repo.files }; repo.draftSha = repo.mainSha; }
    return repo.draft;
  };
  const ok = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json' },
  });

  async function fetchImpl(url, init = {}) {
    const u = String(url);
    if (!u.startsWith('https://api.github.com')) throw new Error('mock: refused non-GitHub fetch ' + u);
    const path = u.slice('https://api.github.com'.length);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, path, body, authorization: (init.headers || {}).Authorization });

    const failure = repo.failures.find((f) => f.match.test(path));
    if (failure) {
      repo.failures.splice(repo.failures.indexOf(failure), 1);
      if (failure.thrown) throw new Error(failure.thrown);
      return ok({ message: failure.message }, failure.status || 500);
    }

    if (/\/git\/ref\/heads\/main$/.test(path)) return ok({ object: { sha: repo.mainSha } });
    if (/\/git\/ref\/heads\/control%2Fdraft$/.test(path)) {
      return repo.draftSha ? ok({ object: { sha: repo.draftSha } }) : ok({ message: 'Not Found' }, 404);
    }
    if (path.endsWith('/git/refs') && method === 'POST') { draftFiles(); return ok({ object: { sha: repo.draftSha } }); }
    if (/\/contents\/images(\?|$)/.test(path)) return ok(repo.images);
    if (/\/contents\//.test(path)) {
      const name = decodeURIComponent(path.split('/contents/')[1].split('?')[0]);
      const text = draftFiles()[name];
      return text === undefined
        ? ok({ message: 'Not Found' }, 404)
        : ok({ content: Buffer.from(text, 'utf8').toString('base64'), sha: 'blob' });
    }
    if (/\/git\/commits\/[^/]+$/.test(path) && method === 'GET') return ok({ tree: { sha: 'tree' } });
    if (path.endsWith('/git/blobs') && method === 'POST') {
      const sha = 'blob' + (++repo.n);
      repo.blobs.set(sha, body.encoding === 'base64'
        ? { binary: true, bytes: Buffer.from(body.content, 'base64') }
        : { binary: false, text: body.content });
      return ok({ sha });
    }
    if (path.endsWith('/git/trees') && method === 'POST') {
      const sha = 'tree' + (++repo.n);
      repo.trees.set(sha, body.tree);
      return ok({ sha });
    }
    if (path.endsWith('/git/commits') && method === 'POST') {
      const d = draftFiles();
      for (const entry of repo.trees.get(body.tree) || []) {
        const blob = repo.blobs.get(entry.sha);
        if (!blob) continue;
        if (blob.binary) repo.images.unshift({ type: 'file', name: entry.path.split('/').pop(), size: blob.bytes.length });
        else d[entry.path] = blob.text;
      }
      repo.commits.push({ message: body.message, parents: body.parents, paths: (repo.trees.get(body.tree) || []).map((e) => e.path) });
      return ok({ sha: 'c' + repo.commits.length });
    }
    if (/\/git\/refs\/heads\//.test(path) && method === 'PATCH') { repo.draftSha = body.sha; return ok({}); }
    if (/\/pulls\?/.test(path)) return ok(repo.pr ? [repo.pr] : []);
    if (path.endsWith('/pulls') && method === 'POST') {
      repo.pr = { number: 99, html_url: 'https://github.com/SectionSevenGroup/sudu/pull/99' };
      return ok(repo.pr);
    }
    if (/\/compare\//.test(path)) {
      const paths = new Set();
      for (const c of repo.commits) for (const p of c.paths) paths.add(p);
      return ok({ ahead_by: repo.commits.length, behind_by: repo.behind, files: [...paths].map((filename) => ({ filename })) });
    }
    if (/\/commits\/[^/]+\/status$/.test(path)) {
      return ok({
        statuses: repo.statuses.map((s) => ({
          context: s.context,
          state: s.state,
          target_url: 'https://deploy-preview-99--sudustudioarchitecture.netlify.app',
          description: s.state === 'success' ? 'Deploy Preview ready!' : 'Deploy Preview processing.',
        })),
      });
    }
    if (/\/pulls\/\d+\/merge$/.test(path)) {
      if (repo.mergeRefusal) return ok({ merged: false, message: repo.mergeRefusal });
      repo.files = { ...draftFiles() };
      repo.commits = [];
      repo.draft = null;
      repo.pr = null;
      repo.mainSha = 'merged' + (++repo.merges);
      repo.draftSha = null;         // Control is expected to move it back
      return ok({ merged: true, sha: repo.mainSha });
    }
    if (path.endsWith('/merges') && method === 'POST') { repo.behind = 0; return ok({ sha: 'mergeback' }); }
    return ok({ message: 'mock: unhandled ' + method + ' ' + path }, 404);
  }

  let saved = null;
  return {
    repo,
    calls,
    fetch: fetchImpl,
    env: { ...ENV },
    // the requests Control made, filtered
    made: (method, re) => calls.filter((c) => c.method === method && re.test(c.path)),
    failNext(match, status, message) { repo.failures.push({ match, status, message }); },
    throwNext(match, message) { repo.failures.push({ match, thrown: message }); },
    install() { saved = globalThis.fetch; globalThis.fetch = fetchImpl; },
    restore() { if (saved) globalThis.fetch = saved; },
  };
}
