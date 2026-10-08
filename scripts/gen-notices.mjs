#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, basename, dirname } from 'path';

const USAGE = `Usage:
  node scripts/gen-notices.mjs --npm <license-checker.json> --py <venv> [<venv...>]

Generates THIRD_PARTY_NOTICES.md on stdout. Requires:
  --npm   JSON output of "npx license-checker-rseidelsohn --start app --json"
  --py    path(s) to one or more Python virtualenvs (read-only; uses site-packages METADATA)

Example:
  npx license-checker-rseidelsohn --start app --json > /tmp/npm-licenses.json
  node scripts/gen-notices.mjs --npm /tmp/npm-licenses.json --py importer/venv mcp/venv \
    > THIRD_PARTY_NOTICES.md`;

function parseArgs(argv) {
  const args = { npm: null, py: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--npm') args.npm = argv[++i];
    else if (a === '--py') { while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) args.py.push(argv[++i]); }
    else { console.error(USAGE); process.exit(2); }
  }
  if (!args.npm || args.py.length === 0) { console.error(USAGE); process.exit(2); }
  return args;
}

function sitePackages(root) {
  const base = join(root, 'lib');
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base)) {
    if (!d.startsWith('python')) continue;
    const sp = join(base, d, 'site-packages');
    if (existsSync(sp)) return sp;
  }
  const lib64 = join(root, 'lib64');
  if (existsSync(lib64)) {
    for (const d of readdirSync(lib64)) {
      const sp = join(lib64, d, 'site-packages');
      if (existsSync(sp)) return sp;
    }
  }
  return null;
}

function norm(l) {
  if (!l || l === 'UNKNOWN') return 'UNKNOWN';
  const s = String(l);
  if (/MIT-0/.test(s)) return 'MIT-0';
  if (/BlueOak/.test(s)) return 'BlueOak-1.0.0';
  if (/Unlicense/.test(s)) return 'Unlicense';
  if (/0BSD/.test(s)) return '0BSD';
  if (/Python-2\.0/.test(s)) return 'Python-2.0';
  if (/Apache.*2|Apache Software License|Apache 2\.0/.test(s)) return 'Apache-2.0';
  if (/CC-BY-4\.0/.test(s)) return 'CC-BY-4.0';
  if (/MPL/.test(s) && s.includes('AND')) return 'MPL-2.0 AND MIT';
  if (/MPL/.test(s)) return 'MPL-2.0';
  if (/LGPL/.test(s)) return 'LGPL-3.0';
  if (/PSF|Python Software Foundation/.test(s)) return 'PSF-2.0';
  if (/MIT-CMU|HPND|PIL/i.test(s)) return 'MIT-CMU';
  if (/BSD-2/.test(s)) return 'BSD-2-Clause';
  if (/BSD-3/.test(s)) return 'BSD-3-Clause';
  if (/BSD/.test(s) && /-3/.test(s)) return 'BSD-3-Clause';
  if (/BSD/.test(s)) return 'BSD-3-Clause';
  if (/ISC/.test(s)) return 'ISC';
  if (/MIT/.test(s)) return 'MIT';
  return 'UNKNOWN';
}

function readPy(root) {
  const sp = sitePackages(root);
  const out = [];
  if (!sp) { console.error(`site-packages not found in ${root}`); process.exit(2); }
  for (const e of readdirSync(sp, { withFileTypes: true })) {
    if (!e.isDirectory() || !e.name.endsWith('.dist-info')) continue;
    const dir = join(sp, e.name);
    const metaPath = join(dir, 'METADATA');
    if (!existsSync(metaPath)) continue;
    const meta = readFileSync(metaPath, 'utf8');
    const get = (re) => { const m = meta.match(re); return m ? m[1].trim() : ''; };
    const name = get(/^Name:\s*(.+)$/m) || e.name;
    const version = get(/^Version:\s*(.+)$/m) || '?';
    const licExpr = get(/^License-Expression:\s*(.+)$/m);
    const licField = get(/^License:\s*(.+)$/m);
    const classifiers = [...meta.matchAll(/^Classifier:\s*License :: ([^\n]+)$/gm)]
      .map((x) => x[1].trim()).filter((c) => c !== 'OSI Approved');
    const candidates = [licExpr, licField, ...classifiers].filter(Boolean);
    const license = candidates.find((c) => norm(c) !== 'UNKNOWN') || candidates[0] || 'UNKNOWN';
    const author = (
      get(/^Author-email:\s*(.+)$/m).replace(/[<>]/g, '').split(/,\s*/)[0]
      || get(/^Author:\s*(.+)$/m)
    ).replace(/\s*\((.*?)\)\s*/g, ' $1 ').trim();
    let licFile = '';
    for (const f of ['LICENSE', 'LICENSE.txt', 'LICENSE.rst', 'LICENSE.md', 'COPYING.logger']) {
      const p = join(dir, f);
      if (existsSync(p)) { licFile = p; break; }
    }
    out.push({ name, version, license, licenseFile: licFile, publisher: author });
  }
  return out;
}

const CANONICAL = {
  'MIT': `MIT License

Copyright (c) <year> <copyright holders>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,

  'ISC': `ISC License

Copyright (c) <year> <copyright holders>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.`,

  'BSD-2-Clause': `BSD 2-Clause License

Copyright (c) <year> <copyright holders>

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.`,

  'BSD-3-Clause': `BSD 3-Clause License

Copyright (c) <year> <copyright holders>

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.`,

  '0BSD': `BSD Zero Clause License

Copyright (c) <year> <copyright holders>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.`,

  'Unlicense': `This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or distribute
this software, either in source code form or as a compiled binary, for any
purpose, commercial or non-commercial, and by any means.

In jurisdictions that recognize copyright laws, the author or authors of this
software dedicate any and all copyright interest in the software to the public
domain. We make this dedication for the benefit of the public at large and to
the detriment of our heirs and successors. We intend this dedication to be an
overt act of relinquishment in perpetuity of all present and future rights to
this software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <https://unlicense.org>`,

  'MIT-0': `MIT No Attribution License

Copyright <year> <copyright holders>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`,

  'BlueOak-1.0.0': `# Blue Oak Model License

Version 1.0.0

## Purpose

This license gives everyone as much permission to work with this software as
possible, while protecting contributors from liability.

## Acceptance

In order to receive this license, you must agree to its rules. The rules of
this license are both obligations under that agreement and conditions to your
license. You must not do anything with this software that triggers a rule that
you cannot or will not follow.

## Copyright

Each contributor licenses you to do everything with this software that would
otherwise infringe that contributor's copyright in it.

## Notices

You must ensure that everyone who gets a copy of any part of this software
from you, with or without changes, also gets the text of this license or a
link to <https://blueoakcouncil.org/license/1.0.0>.

## Excuse

If anyone notifies you in writing that you have not complied with Notices, you
can keep your license by taking all practical steps to comply within 30 days
after the notice. If you do not do so, your license ends.

## Patent

Each contributor licenses you to do everything with this software that would
otherwise infringe any patent claims they can license or become able to
license.

## Reliability

No contributor can revoke this license.

## No Liability

As far as the law allows, this software comes as is, without any warranty or
condition, and no contributor will be liable to anyone for any damages related
to this software or this license, under any kind of legal claim.`,

  'PSF-2.0': `PYTHON SOFTWARE FOUNDATION LICENSE VERSION 2

1. This LICENSE AGREEMENT is between the Python Software Foundation (PSF), and
the Individual or Organization (Licensee) accessing and otherwise using Python
software in source or binary form and its associated documentation.

2. Subject to the terms and conditions of this License Agreement, PSF hereby
grants Licensee a nonexclusive, royalty-free, world-wide license to reproduce,
analyze, test, perform and/or display publicly, prepare derivative works,
distribute, and otherwise use Python alone or in any derivative version,
provided that Licensee's License Agreement is included with such Python or any
derivative version.

3. In the event Licensee prepares a derivative work that is based on or
incorporates Python or any part thereof, and wants to make the derivative work
available to others as provided herein, then Licensee hereby agrees to include
in any such work a brief summary of the changes made to Python.

4. PSF is making Python available to Licensee on an "AS IS" basis. PSF MAKES
NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR IMPLIED. By way of example, but
not limitation, PSF MAKES NO REPRESENTATIONS OR WARRANTIES OF MERCHANTABILITY
OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF THE SOFTWARE WILL NOT
INFRINGE ANY THIRD PARTY RIGHTS.

5. PSF SHALL NOT BE LIABLE TO LICENSEE OR ANY OTHER USERS OF PYTHON FOR ANY
INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES OR LOSS AS A RESULT OF
MODIFYING, DISTRIBUTING, OR OTHERWISE USING PYTHON, OR ANY DERIVATIVE THEREOF,
EVEN IF ADVISED OF THE POSSIBILITY THEREOF.

6. This License Agreement will automatically terminate upon a material breach
of its terms and conditions.

7. Nothing in this License Agreement shall be deemed to create any relationship
of agency, partnership, or joint venture between PSF and Licensee. This License
Agreement does not grant permission to use PSF trademarks or trade name in a
promotional or advertising sense without the prior written consent of PSF.

8. By copying, installing or otherwise using Python, Licensee agrees to be
bound by the terms and conditions of this License Agreement.`,

  'Python-2.0': `PYTHON SOFTWARE FOUNDATION LICENSE VERSION 2

1. This LICENSE AGREEMENT is between the Python Software Foundation (PSF), and
the Individual or Organization (Licensee) accessing and otherwise using Python
software in source or binary form and its associated documentation.

2. Subject to the terms and conditions of this License Agreement, PSF hereby
grants Licensee a nonexclusive, royalty-free, world-wide license to reproduce,
analyze, test, perform and/or display publicly, prepare derivative works,
distribute, and otherwise use Python alone or in any derivative version,
provided that Licensee's License Agreement is included with such Python or any
derivative version.

3. In the event Licensee prepares a derivative work that is based on or
incorporates Python or any part thereof, and wants to make the derivative work
available to others as provided herein, then Licensee hereby agrees to include
in any such work a brief summary of the changes made to Python.

4. PSF is making Python available to Licensee on an "AS IS" basis. PSF MAKES
NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR IMPLIED. By way of example, but
not limitation, PSF MAKES NO REPRESENTATIONS OR WARRANTIES OF MERCHANTABILITY
OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF THE SOFTWARE WILL NOT
INFRINGE ANY THIRD PARTY RIGHTS.

5. PSF SHALL NOT BE LIABLE TO LICENSEE OR ANY OTHER USERS OF PYTHON FOR ANY
INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES OR LOSS AS A RESULT OF
MODIFYING, DISTRIBUTING, OR OTHERWISE USING PYTHON, OR ANY DERIVATIVE THEREOF,
EVEN IF ADVISED OF THE POSSIBILITY THEREOF.`,
};

const TEXT_HINTS = {
  'Apache-2.0': [/typescript/, 'node_modules'],
  'CC-BY-4.0': [/caniuse-lite/, 'node_modules'],
  'MIT-CMU': [/pillow/, 'site-packages'],
  'MPL-2.0': [/certifi/, 'site-packages'],
  'LGPL-3.0': [/psycopg2/, 'site-packages'],
};

function isLicenseFile(p) {
  const base = basename(p.licenseFile || '').toLowerCase();
  return /^licen|^copying|^notice/i.test(base) && !base.includes('readme');
}

function findText(license, pkgs) {
  if (CANONICAL[license]) return CANONICAL[license];
  const hints = TEXT_HINTS[license];
  const want = hints ? hints[1] : 'node_modules';
  for (const p of pkgs) {
    if (p.licenseFile && want === (p.licenseFile.includes('site-packages') ? 'site-packages' : 'node_modules') &&
        existsSync(p.licenseFile) && statSync(p.licenseFile).size > 0 && isLicenseFile(p)) {
      const t = readFileSync(p.licenseFile, 'utf8');
      if (t.trim().length > 100) return t.replace(/\r\n/g, '\n').trim();
    }
  }
  for (const p of pkgs) {
    const h = (hints && hints[0]) || null;
    if (h && h.test(p.name) && p.licenseFile && existsSync(p.licenseFile) && isLicenseFile(p)) {
      return readFileSync(p.licenseFile, 'utf8').replace(/\r\n/g, '\n').trim();
    }
  }
  return '';
}

const args = parseArgs(process.argv.slice(2));

const npmData = readFileSync(args.npm, 'utf8');
const npmPkgs = Object.entries(JSON.parse(npmData)).map(([key, p]) => ({
  name: key.replace(/@([^@]+)$/, ''),
  version: (key.match(/@([^@]+)$/) || [])[1] || '?', license: p.licenses || 'UNKNOWN',
  licenseFile: p.licenseFile || '', publisher: (p.publisher || '').replace(/^.*?<|>$/g, '') || '',
}));

const pyScopes = args.py.map((r) => ({ key: basename(dirname(r)), pkgs: readPy(r) }));
const all = { npm: npmPkgs };
for (const s of pyScopes) all[s.key] = s.pkgs;

const groups = {};
for (const scope of Object.keys(all)) {
  groups[scope] = {};
  for (const p of all[scope]) {
    const k = norm(p.license);
    (groups[scope][k] = groups[scope][k] || []).push(p);
  }
}

const lines = [];
lines.push('# Third-party notices');
lines.push('');
lines.push('PFM is self-hosted software that builds on a large number of open-source packages. ' +
  'This file lists the third-party components, their licenses, and the license texts, as required ' +
  'by the licenses that carry redistribution obligations (MIT, ISC, BSD, Apache-2.0, MPL-2.0, LGPL, etc.).');
lines.push('');
lines.push(`Generated on ${new Date().toISOString().slice(0, 10)} from the currently installed package sets ` +
  '(`app/node_modules` for npm; the Python virtualenvs given via --py). Regenerate it whenever dependencies change.');
lines.push('');

lines.push('## Vendored code');
lines.push('');
lines.push('### shadcn/ui — MIT');
lines.push('');
lines.push('The UI components under `app/client/src/components/ui/` and `app/client/src/lib/utils.ts`.');
lines.push('');
lines.push('```text');
lines.push('MIT License');
lines.push('');
lines.push('Copyright (c) 2023 shadcn');
lines.push('');
lines.push('Permission is hereby granted, free of charge, to any person obtaining a copy');
lines.push('of this software and associated documentation files (the "Software"), to deal');
lines.push('in the Software without restriction, including without limitation the rights');
lines.push('to use, copy, modify, merge, publish, distribute, sublicense, and/or sell');
lines.push('copies of the Software, and to permit persons to whom the Software is');
lines.push('furnished to do so, subject to the following conditions:');
lines.push('');
lines.push('The above copyright notice and this permission notice shall be included in all');
lines.push('copies or substantial portions of the Software.');
lines.push('');
lines.push('THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR');
lines.push('IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,');
lines.push('FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE');
lines.push('AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER');
lines.push('LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,');
lines.push('OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE');
lines.push('SOFTWARE.');
lines.push('```');
lines.push('');

lines.push('## Licenses in use (summary)');
lines.push('');
const allGroups = {};
for (const scope of Object.keys(groups)) for (const k of Object.keys(groups[scope])) allGroups[k] = (allGroups[k] || 0) + groups[scope][k].length;
for (const [k, n] of Object.entries(allGroups).sort((a, b) => b[1] - a[1])) lines.push(`- **${k}** — ${n} package(s)`);
lines.push('');

lines.push('<details><summary>Unlicensed dev-time packages (excluded)</summary>');
lines.push('');
lines.push('The following packages are used only at build/dev time and declare no license (`@replit/*` Vite ' +
  'plugins). They are excluded from the notices and targeted for removal:');
lines.push('');
for (const p of all.npm) {
  if (norm(p.license) === 'UNKNOWN') lines.push(`- \`${p.name}\``);
}
lines.push('');
lines.push('</details>');
lines.push('');

const scopes = [['npm — Web frontend (app/)', 'npm']];
for (const s of pyScopes) {
  const label = s.key === 'importer' ? 'statement importer (importer/)'
    : s.key === 'mcp' ? 'MCP server (mcp/)' : s.key;
  scopes.push([`Python — ${label}`, s.key]);
}

for (const [title, scope] of scopes) {
  lines.push(`## ${scope === 'npm' ? 'npm' : 'Python'} dependencies — ${title.split(' — ')[1]}`);
  lines.push('');
  for (const [k, pkgs] of Object.entries(groups[scope]).sort((a, b) => b[1].length - a[1].length)) {
    if (k === 'UNKNOWN') continue;
    lines.push(`### ${k}`);
    lines.push('');
    for (const p of [...pkgs].sort((a, b) => a.name.localeCompare(b.name))) {
      const pub = p.publisher ? ` — ${p.publisher}` : '';
      lines.push(`- \`${p.name}${p.version ? '@' + p.version : ''}\`${pub}`);
    }
    lines.push('');
  }
}

lines.push('---');
lines.push('');
lines.push('# License texts');
lines.push('');
for (const k of Object.keys(allGroups).sort()) {
  if (k === 'UNKNOWN') continue;
  const pkgs = Object.values(groups).flatMap((g) => g[k] || []);
  const text = findText(k, pkgs);
  if (!text) {
    const ref = { 'Apache-2.0': 'https://www.apache.org/licenses/LICENSE-2.0.txt', 'MPL-2.0': 'https://www.mozilla.org/media/MPL/2.0/index.txt', 'LGPL-3.0': 'https://www.gnu.org/licenses/lgpl-3.0.txt', 'MPL-2.0 AND MIT': 'https://www.mozilla.org/media/MPL/2.0/index.txt', 'MIT-CMU': 'https://raw.githubusercontent.com/python-pillow/Pillow/main/LICENSE' }[k];
    if (ref) { lines.push(`## ${k}`); lines.push(''); lines.push(`Full text: ${ref}`); lines.push(''); continue; }
  }
  lines.push(`## ${k}`);
  lines.push('');
  if (text) {
    lines.push('```text');
    lines.push(text.trim());
    lines.push('```');
  } else {
    lines.push('(license text not retrievable from the installed package; see the package itself.)');
  }
  lines.push('');
}

process.stdout.write(lines.join('\n') + '\n');