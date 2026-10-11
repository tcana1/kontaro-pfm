# Third-party notices

PFM is self-hosted software that builds on a large number of open-source packages. This file lists the third-party components, their licenses, and the license texts, as required by the licenses that carry redistribution obligations (MIT, ISC, BSD, Apache-2.0, MPL-2.0, LGPL, etc.).

Generated on 2026-09-13 from the currently installed package sets (`app/node_modules` for npm; the Python virtualenvs given via --py). Regenerate it whenever dependencies change.

## Vendored code

### shadcn/ui — MIT

The UI components under `app/client/src/components/ui/` and `app/client/src/lib/utils.ts`.

```text
MIT License

Copyright (c) 2023 shadcn

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
SOFTWARE.
```

## Licenses in use (summary)

- **MIT** — 659 package(s)
- **ISC** — 62 package(s)
- **BSD-3-Clause** — 29 package(s)
- **Apache-2.0** — 26 package(s)
- **BSD-2-Clause** — 15 package(s)
- **UNKNOWN** — 3 package(s)
- **BlueOak-1.0.0** — 3 package(s)
- **PSF-2.0** — 3 package(s)
- **MPL-2.0** — 2 package(s)
- **LGPL-3.0** — 2 package(s)
- **MIT-0** — 1 package(s)
- **Python-2.0** — 1 package(s)
- **CC-BY-4.0** — 1 package(s)
- **0BSD** — 1 package(s)
- **Unlicense** — 1 package(s)
- **MIT-CMU** — 1 package(s)
- **MPL-2.0 AND MIT** — 1 package(s)

<details><summary>Unlicensed dev-time packages (excluded)</summary>

The following packages are used only at build/dev time and declare no license (`@replit/*` Vite plugins). They are excluded from the notices and targeted for removal:

- `@replit/vite-plugin-cartographer`
- `@replit/vite-plugin-runtime-error-modal`
- `@replit/vite-plugin-shadcn-theme-json`

</details>

## npm dependencies — Web frontend (app/)

### MIT

- `@adobe/css-tools@4.4.3` — TJ Holowaychuk
- `@alloc/quick-lru@5.2.0` — Sindre Sorhus
- `@asamuzakjp/css-color@3.2.0` — asamuzaK
- `@babel/code-frame@7.27.1` — The Babel Team
- `@babel/compat-data@7.28.0` — The Babel Team
- `@babel/core@7.28.0` — The Babel Team
- `@babel/generator@7.28.0` — The Babel Team
- `@babel/helper-compilation-targets@7.27.2` — The Babel Team
- `@babel/helper-globals@7.28.0` — The Babel Team
- `@babel/helper-module-imports@7.27.1` — The Babel Team
- `@babel/helper-module-transforms@7.27.3` — The Babel Team
- `@babel/helper-plugin-utils@7.27.1` — The Babel Team
- `@babel/helper-string-parser@7.27.1` — The Babel Team
- `@babel/helper-validator-identifier@7.27.1` — The Babel Team
- `@babel/helper-validator-option@7.27.1` — The Babel Team
- `@babel/helpers@7.28.2` — The Babel Team
- `@babel/parser@7.28.0` — The Babel Team
- `@babel/plugin-transform-react-jsx-self@7.27.1` — The Babel Team
- `@babel/plugin-transform-react-jsx-source@7.27.1` — The Babel Team
- `@babel/runtime@7.29.7` — The Babel Team
- `@babel/template@7.27.2` — The Babel Team
- `@babel/traverse@7.28.0` — The Babel Team
- `@babel/types@7.28.2` — The Babel Team
- `@bcoe/v8-coverage@1.0.2` — Charles Samborski
- `@csstools/css-calc@2.1.4`
- `@csstools/css-color-parser@3.0.10`
- `@csstools/css-parser-algorithms@3.0.5`
- `@csstools/css-tokenizer@3.0.4`
- `@esbuild/linux-x64@0.21.5`
- `@esbuild/linux-x64@0.25.8`
- `@floating-ui/core@1.7.3` — atomiks
- `@floating-ui/dom@1.7.3` — atomiks
- `@floating-ui/react-dom@2.1.5` — atomiks
- `@floating-ui/utils@0.2.10` — atomiks
- `@gulpjs/to-absolute-glob@4.0.0` — Gulp Team
- `@hookform/resolvers@3.10.0` — bluebill1049
- `@inquirer/confirm@5.1.14` — Simon Boudrias
- `@inquirer/core@10.1.15` — Simon Boudrias
- `@inquirer/figures@1.0.13` — Simon Boudrias
- `@inquirer/type@3.0.8` — Simon Boudrias
- `@istanbuljs/schema@0.1.3` — Corey Farrell
- `@jridgewell/gen-mapping@0.3.12` — Justin Ridgewell
- `@jridgewell/resolve-uri@3.1.2` — Justin Ridgewell
- `@jridgewell/sourcemap-codec@1.5.4` — Justin Ridgewell
- `@jridgewell/trace-mapping@0.3.29` — Justin Ridgewell
- `@kurkle/color@0.3.4` — Jukka Kurkela
- `@mswjs/interceptors@0.39.5` — Artem Zakharchenko
- `@nodelib/fs.scandir@2.1.5`
- `@nodelib/fs.stat@2.0.5`
- `@nodelib/fs.walk@1.2.8`
- `@open-draft/deferred-promise@2.2.0` — Artem Zakharchenko
- `@open-draft/logger@0.3.0` — Artem Zakharchenko
- `@open-draft/until@2.1.0` — Artem Zakharchenko
- `@pkgjs/parseargs@0.11.0`
- `@radix-ui/number@1.1.1`
- `@radix-ui/primitive@1.1.2`
- `@radix-ui/react-accordion@1.2.11`
- `@radix-ui/react-alert-dialog@1.1.14`
- `@radix-ui/react-arrow@1.1.7`
- `@radix-ui/react-aspect-ratio@1.1.7`
- `@radix-ui/react-avatar@1.1.10`
- `@radix-ui/react-checkbox@1.3.2`
- `@radix-ui/react-collapsible@1.1.11`
- `@radix-ui/react-collection@1.1.7`
- `@radix-ui/react-compose-refs@1.1.2`
- `@radix-ui/react-context@1.1.2`
- `@radix-ui/react-context-menu@2.2.15`
- `@radix-ui/react-dialog@1.1.14`
- `@radix-ui/react-direction@1.1.1`
- `@radix-ui/react-dismissable-layer@1.1.10`
- `@radix-ui/react-dropdown-menu@2.1.15`
- `@radix-ui/react-focus-guards@1.1.2`
- `@radix-ui/react-focus-scope@1.1.7`
- `@radix-ui/react-hover-card@1.1.14`
- `@radix-ui/react-id@1.1.1`
- `@radix-ui/react-label@2.1.7`
- `@radix-ui/react-menu@2.1.15`
- `@radix-ui/react-menubar@1.1.15`
- `@radix-ui/react-navigation-menu@1.2.13`
- `@radix-ui/react-popover@1.1.14`
- `@radix-ui/react-popper@1.2.7`
- `@radix-ui/react-portal@1.1.9`
- `@radix-ui/react-presence@1.1.4`
- `@radix-ui/react-primitive@2.1.3`
- `@radix-ui/react-progress@1.1.7`
- `@radix-ui/react-radio-group@1.3.7`
- `@radix-ui/react-roving-focus@1.1.10`
- `@radix-ui/react-scroll-area@1.2.9`
- `@radix-ui/react-select@2.2.5`
- `@radix-ui/react-separator@1.1.7`
- `@radix-ui/react-slider@1.3.5`
- `@radix-ui/react-slot@1.2.3`
- `@radix-ui/react-switch@1.2.5`
- `@radix-ui/react-tabs@1.1.12`
- `@radix-ui/react-toast@1.2.14`
- `@radix-ui/react-toggle@1.1.9`
- `@radix-ui/react-toggle-group@1.1.10`
- `@radix-ui/react-tooltip@1.2.7`
- `@radix-ui/react-use-callback-ref@1.1.1`
- `@radix-ui/react-use-controllable-state@1.2.2`
- `@radix-ui/react-use-effect-event@0.0.2`
- `@radix-ui/react-use-escape-keydown@1.1.1`
- `@radix-ui/react-use-is-hydrated@0.1.0`
- `@radix-ui/react-use-layout-effect@1.1.1`
- `@radix-ui/react-use-previous@1.1.1`
- `@radix-ui/react-use-rect@1.1.1`
- `@radix-ui/react-use-size@1.1.1`
- `@radix-ui/react-visually-hidden@1.2.3`
- `@radix-ui/rect@1.1.1`
- `@rolldown/pluginutils@1.0.0-beta.27`
- `@rollup/pluginutils@5.2.0` — Rich Harris
- `@rollup/rollup-linux-x64-gnu@4.46.2` — Lukas Taegert-Atkinson
- `@rollup/rollup-linux-x64-musl@4.46.2` — Lukas Taegert-Atkinson
- `@sinclair/typebox@0.33.22` — sinclairzx81
- `@supabase/auth-js@2.71.1` — Supabase
- `@supabase/functions-js@2.4.5` — Supabase
- `@supabase/node-fetch@2.6.15` — David Frank
- `@supabase/postgrest-js@1.19.4` — Supabase
- `@supabase/realtime-js@2.15.0` — Supabase
- `@supabase/storage-js@2.10.4` — Supabase
- `@supabase/supabase-js@2.54.0` — Supabase
- `@svgr/babel-plugin-add-jsx-attribute@8.0.0` — Greg Bergé
- `@svgr/babel-plugin-remove-jsx-attribute@8.0.0` — Greg Bergé
- `@svgr/babel-plugin-remove-jsx-empty-expression@8.0.0` — Greg Bergé
- `@svgr/babel-plugin-replace-jsx-attribute-value@8.0.0` — Greg Bergé
- `@svgr/babel-plugin-svg-dynamic-title@8.0.0` — Greg Bergé
- `@svgr/babel-plugin-svg-em-dimensions@8.0.0` — Greg Bergé
- `@svgr/babel-plugin-transform-react-native-svg@8.1.0` — Greg Bergé
- `@svgr/babel-plugin-transform-svg-component@8.0.0` — Greg Bergé
- `@svgr/babel-preset@8.1.0` — Greg Bergé
- `@svgr/core@8.1.0` — Greg Bergé
- `@svgr/hast-util-to-babel-ast@8.0.0` — Greg Bergé
- `@svgr/plugin-jsx@8.1.0` — Greg Bergé
- `@tailwindcss/typography@0.5.16`
- `@tanstack/query-core@5.83.1` — tannerlinsley
- `@tanstack/react-query@5.84.1` — tannerlinsley
- `@testing-library/dom@10.4.1` — Kent C. Dodds
- `@testing-library/jest-dom@6.6.4` — Ernesto Garcia
- `@testing-library/react@16.3.0` — Kent C. Dodds
- `@testing-library/user-event@14.6.1` — Giorgio Polvara
- `@types/aria-query@5.0.4`
- `@types/babel__core@7.20.5`
- `@types/babel__generator@7.27.0`
- `@types/babel__template@7.4.4`
- `@types/babel__traverse@7.28.0`
- `@types/chai@5.2.2`
- `@types/cookie@0.6.0`
- `@types/d3-array@3.2.1`
- `@types/d3-color@3.1.3`
- `@types/d3-ease@3.0.2`
- `@types/d3-interpolate@3.0.4`
- `@types/d3-path@3.1.1`
- `@types/d3-scale@4.0.9`
- `@types/d3-shape@3.1.7`
- `@types/d3-time@3.0.4`
- `@types/d3-timer@3.0.2`
- `@types/debug@4.1.13`
- `@types/deep-eql@4.0.2`
- `@types/estree@1.0.8`
- `@types/estree-jsx@1.0.5`
- `@types/hast@3.0.4`
- `@types/mdast@4.0.4`
- `@types/minimatch@3.0.5`
- `@types/ms@2.1.0`
- `@types/node@22.17.0`
- `@types/phoenix@1.6.6`
- `@types/prop-types@15.7.15`
- `@types/react@18.3.23`
- `@types/react-dom@18.3.7`
- `@types/statuses@2.0.6`
- `@types/symlink-or-copy@1.2.2`
- `@types/tough-cookie@4.0.5`
- `@types/unist@2.0.11`
- `@types/unist@3.0.3`
- `@types/ws@8.18.1`
- `@vitejs/plugin-react@4.7.0` — Evan You
- `@vitest/coverage-v8@3.2.4` — Anthony Fu
- `@vitest/expect@3.2.4`
- `@vitest/mocker@3.2.4`
- `@vitest/pretty-format@3.2.4`
- `@vitest/runner@3.2.4`
- `@vitest/snapshot@3.2.4`
- `@vitest/spy@3.2.4`
- `@vitest/utils@3.2.4`
- `agent-base@7.1.4` — Nathan Rajlich
- `ansi-escapes@4.3.2` — Sindre Sorhus
- `ansi-regex@5.0.1` — Sindre Sorhus
- `ansi-regex@6.1.0` — Sindre Sorhus
- `ansi-styles@4.3.0` — Sindre Sorhus
- `ansi-styles@5.2.0` — Sindre Sorhus
- `ansi-styles@6.2.1` — Sindre Sorhus
- `any-promise@1.3.0` — Kevin Beaty
- `arg@5.0.2` — Josh Junon
- `aria-hidden@1.2.6` — Anton Korzunov
- `assertion-error@2.0.1` — Jake Luer
- `ast-v8-to-istanbul@0.3.4` — Ari Perkkiö
- `autoprefixer@10.4.21` — Andrey Sitnik
- `bail@2.0.2` — Titus Wormer
- `balanced-match@1.0.2` — Julian Gruber
- `base64-js@1.5.1` — T. Jameson Little
- `binary-extensions@2.3.0` — Sindre Sorhus
- `bl@5.1.0`
- `brace-expansion@1.1.18` — Julian Gruber
- `brace-expansion@2.0.2` — Julian Gruber
- `braces@3.0.3` — Jon Schlinkert
- `broccoli-node-api@1.7.0` — Jo Liss
- `broccoli-node-info@2.2.0` — Jo Liss
- `broccoli-output-wrapper@3.2.5` — sparshithNR
- `broccoli-plugin@4.0.7` — Jo Liss
- `browserslist@4.25.1` — Andrey Sitnik
- `buffer@6.0.3` — Feross Aboukhadijeh
- `cac@6.7.14` — egoist
- `callsites@3.1.0` — Sindre Sorhus
- `camelcase@6.3.0` — Sindre Sorhus
- `camelcase-css@2.0.1` — Steven Vachon
- `ccount@2.0.1` — Titus Wormer
- `chai@5.2.1` — Jake Luer
- `character-entities@2.0.2` — Titus Wormer
- `character-entities-html4@2.1.0` — Titus Wormer
- `character-entities-legacy@3.0.0` — Titus Wormer
- `character-reference-invalid@2.0.1` — Titus Wormer
- `check-error@2.1.1` — Jake Luer
- `cheerio@1.2.0` — Matt Mueller
- `chokidar@3.6.0` — Paul Miller
- `clone@2.1.2` — Paul Vorbach
- `clsx@2.1.1` — Luke Edwards
- `cmdk@1.1.1` — Paco
- `color-convert@2.0.1` — Heather Arthur
- `color-name@1.1.4` — DY
- `colorjs.io@0.5.2`
- `colors@1.4.0` — Marak Squires
- `comma-separated-tokens@2.0.3` — Titus Wormer
- `commander@12.1.0` — TJ Holowaychuk
- `commander@4.1.1` — TJ Holowaychuk
- `concat-map@0.0.1` — James Halliday
- `convert-source-map@2.0.0` — Thorsten Lorenz
- `cookie@0.7.2` — Roman Shtylman
- `core-util-is@1.0.3` — Isaac Z. Schlueter
- `cosmiconfig@8.3.6` — Daniel Fischer
- `cross-spawn@7.0.6` — André Cruz
- `css.escape@1.5.1` — Mathias Bynens
- `cssesc@3.0.0` — Mathias Bynens
- `cssstyle@4.6.0`
- `csstype@3.1.3` — Fredrik Nicol
- `data-urls@5.0.0` — Domenic Denicola
- `date-fns@3.6.0`
- `debug@2.6.9` — TJ Holowaychuk
- `debug@4.4.1` — Josh Junon
- `decimal.js@10.6.0` — Michael Mclaughlin
- `decimal.js-light@2.5.1` — Michael Mclaughlin
- `decode-named-character-reference@1.3.0` — Titus Wormer
- `dedent@1.6.0` — Desmond Brand
- `deep-eql@5.0.2` — Jake Luer
- `dequal@2.0.3` — Luke Edwards
- `detect-node-es@1.1.0` — Ilya Kantor
- `devlop@1.1.0` — Titus Wormer
- `dlv@1.1.3` — Jason Miller
- `dom-accessibility-api@0.5.16`
- `dom-accessibility-api@0.6.3`
- `dom-helpers@5.2.1` — Jason Quense
- `dom-serializer@2.0.0` — Felix Boehm
- `dot-case@3.0.4` — Blake Embrey
- `eastasianwidth@0.2.0` — Masaki Komagata
- `embla-carousel@8.6.0` — David Jerleke
- `embla-carousel-react@8.6.0` — David Jerleke
- `embla-carousel-reactive-utils@8.6.0` — David Jerleke
- `emoji-regex@8.0.0` — Mathias Bynens
- `emoji-regex@9.2.2` — Mathias Bynens
- `encoding-sniffer@0.2.1` — Felix Boehm
- `eol@0.9.1` — Ryan Van Etten
- `error-ex@1.3.2`
- `es-module-lexer@1.7.0` — Guy Bedford
- `esbuild@0.21.5`
- `esbuild@0.25.8`
- `escalade@3.2.0` — Luke Edwards
- `escape-string-regexp@5.0.0` — Sindre Sorhus
- `estree-util-is-identifier-name@3.0.0` — Titus Wormer
- `estree-walker@2.0.2` — Rich Harris
- `estree-walker@3.0.3` — Rich Harris
- `eventemitter3@4.0.7` — Arnout Kazemier
- `extend@3.0.2` — Stefan Thomas
- `fast-equals@5.2.2` — tony_quetano@planttheidea.com
- `fast-fifo@1.3.2` — Mathias Buus
- `fast-glob@3.3.3` — Denis Malinochkin
- `fdir@6.4.6` — thecodrr
- `fill-range@7.1.1` — Jon Schlinkert
- `fraction.js@4.3.7` — Robert Eisele
- `framer-motion@11.18.2` — Matt Perry
- `fs-extra@11.4.0` — JP Richardson
- `fs-extra@8.1.0` — JP Richardson
- `fs-merger@3.2.1` — Sparshith NR
- `fs-mkdirp-stream@2.0.1` — Gulp Team
- `fs-tree-diff@2.0.1` — Stefan Penner, David J. Hamilton, Chad Hietala
- `function-bind@1.1.2` — Raynos
- `gensync@1.0.0-beta.2` — Logan Smyth
- `get-nonce@1.0.1` — Anton Korzunov
- `get-tsconfig@4.10.1` — Hiroki Osame
- `glob-stream@8.0.3` — Gulp Team
- `graphql@16.11.0`
- `gulp-sort@2.0.0` — Gilad Peleg
- `has-flag@4.0.0` — Sindre Sorhus
- `hasown@2.0.2` — Jordan Harband
- `hast-util-to-jsx-runtime@2.3.6` — Titus Wormer
- `hast-util-whitespace@3.0.0` — Titus Wormer
- `headers-polyfill@4.0.3` — Artem Zakharchenko
- `heimdalljs@0.2.6`
- `heimdalljs-logger@0.1.10` — David J. Hamilton
- `html-encoding-sniffer@4.0.0` — Domenic Denicola
- `html-escaper@2.0.2` — Andrea Giammarchi
- `html-parse-stringify@4.0.1` — Henrik Joreteg
- `html-url-attributes@3.0.1` — Titus Wormer
- `htmlparser2@10.1.0` — Felix Boehm
- `http-proxy-agent@7.0.2` — Nathan Rajlich
- `https-proxy-agent@7.0.6` — Nathan Rajlich
- `i18next@24.2.3` — Jan Mühlemann
- `i18next@26.4.2` — Jan Mühlemann
- `i18next-browser-languagedetector@8.2.1` — Jan Mühlemann
- `i18next-parser@9.4.0` — Karel Ledru
- `iconv-lite@0.6.3` — Alexander Shtuchkin
- `import-fresh@3.3.1` — Sindre Sorhus
- `indent-string@4.0.0` — Sindre Sorhus
- `inline-style-parser@0.2.7`
- `input-otp@1.4.2` — Guilherme Rodz
- `is-alphabetical@2.0.1` — Titus Wormer
- `is-alphanumerical@2.0.1` — Titus Wormer
- `is-arrayish@0.2.1` — Qix
- `is-binary-path@2.1.0` — Sindre Sorhus
- `is-core-module@2.16.1` — Jordan Harband
- `is-decimal@2.0.1` — Titus Wormer
- `is-extglob@2.1.1` — Jon Schlinkert
- `is-fullwidth-code-point@3.0.0` — Sindre Sorhus
- `is-glob@4.0.3` — Jon Schlinkert
- `is-hexadecimal@2.0.1` — Titus Wormer
- `is-negated-glob@1.0.0` — Jon Schlinkert
- `is-node-process@1.2.0`
- `is-number@7.0.0` — Jon Schlinkert
- `is-plain-obj@4.1.0` — Sindre Sorhus
- `is-potential-custom-element-name@1.0.1` — Mathias Bynens
- `is-valid-glob@1.0.0` — Jon Schlinkert
- `isarray@1.0.0` — Julian Gruber
- `jiti@1.21.7`
- `js-tokens@4.0.0` — Simon Lydell
- `js-tokens@9.0.1` — Simon Lydell
- `js-yaml@4.1.0` — Vladimir Zapparov
- `jsdom@26.1.0`
- `jsesc@3.1.0` — Mathias Bynens
- `json-parse-even-better-errors@2.3.1` — Kat Marchán
- `json5@2.2.3` — Aseem Kishore
- `jsonfile@4.0.0` — JP Richardson
- `jsonfile@6.2.1` — JP Richardson
- `lead@4.0.0` — Gulp Team
- `lilconfig@3.1.3` — antonk52
- `lines-and-columns@1.2.4` — Brian Donovan
- `lodash@4.17.21` — John-David Dalton
- `lodash.castarray@4.4.0` — John-David Dalton
- `lodash.isplainobject@4.0.6` — John-David Dalton
- `lodash.merge@4.6.2` — John-David Dalton
- `longest-streak@3.1.0` — Titus Wormer
- `loose-envify@1.4.0` — Andres Suarez
- `loupe@3.2.0` — Veselin Todorov
- `lower-case@2.0.2` — Blake Embrey
- `lz-string@1.5.0` — pieroxy
- `magic-string@0.30.17` — Rich Harris
- `magicast@0.3.5`
- `make-dir@4.0.0` — Sindre Sorhus
- `markdown-table@3.0.4` — Titus Wormer
- `mdast-util-find-and-replace@3.0.2` — Titus Wormer
- `mdast-util-from-markdown@2.0.3` — Titus Wormer
- `mdast-util-gfm@3.1.0` — Titus Wormer
- `mdast-util-gfm-autolink-literal@2.0.1` — Titus Wormer
- `mdast-util-gfm-footnote@2.1.0` — Titus Wormer
- `mdast-util-gfm-strikethrough@2.0.0` — Titus Wormer
- `mdast-util-gfm-table@2.0.0` — Titus Wormer
- `mdast-util-gfm-task-list-item@2.0.0` — Titus Wormer
- `mdast-util-mdx-expression@2.0.1` — Titus Wormer
- `mdast-util-mdx-jsx@3.2.0` — Titus Wormer
- `mdast-util-mdxjs-esm@2.0.1` — Titus Wormer
- `mdast-util-phrasing@4.1.0` — Victor Felder
- `mdast-util-to-hast@13.2.1` — Titus Wormer
- `mdast-util-to-markdown@2.1.2` — Titus Wormer
- `mdast-util-to-string@4.0.0` — Titus Wormer
- `merge2@1.4.1`
- `micromark@4.0.2` — Titus Wormer
- `micromark-core-commonmark@2.0.3` — Titus Wormer
- `micromark-extension-gfm@3.0.0` — Titus Wormer
- `micromark-extension-gfm-autolink-literal@2.1.0` — Titus Wormer
- `micromark-extension-gfm-footnote@2.1.0` — Titus Wormer
- `micromark-extension-gfm-strikethrough@2.1.0` — Titus Wormer
- `micromark-extension-gfm-table@2.1.1` — Titus Wormer
- `micromark-extension-gfm-tagfilter@2.0.0` — Titus Wormer
- `micromark-extension-gfm-task-list-item@2.1.0` — Titus Wormer
- `micromark-factory-destination@2.0.1` — Titus Wormer
- `micromark-factory-label@2.0.1` — Titus Wormer
- `micromark-factory-space@2.0.1` — Titus Wormer
- `micromark-factory-title@2.0.1` — Titus Wormer
- `micromark-factory-whitespace@2.0.1` — Titus Wormer
- `micromark-util-character@2.1.1` — Titus Wormer
- `micromark-util-chunked@2.0.1` — Titus Wormer
- `micromark-util-classify-character@2.0.1` — Titus Wormer
- `micromark-util-combine-extensions@2.0.1` — Titus Wormer
- `micromark-util-decode-numeric-character-reference@2.0.2` — Titus Wormer
- `micromark-util-decode-string@2.0.1` — Titus Wormer
- `micromark-util-encode@2.0.1` — Titus Wormer
- `micromark-util-html-tag-name@2.0.1` — Titus Wormer
- `micromark-util-normalize-identifier@2.0.1` — Titus Wormer
- `micromark-util-resolve-all@2.0.1` — Titus Wormer
- `micromark-util-sanitize-uri@2.0.1` — Titus Wormer
- `micromark-util-subtokenize@2.1.0` — Titus Wormer
- `micromark-util-symbol@2.0.1` — Titus Wormer
- `micromark-util-types@2.0.2` — Titus Wormer
- `micromatch@4.0.8` — Jon Schlinkert
- `min-indent@1.0.1` — James Kyle
- `mitt@3.0.1`
- `mktemp@2.0.4` — sasa+1
- `modern-screenshot@4.6.5` — wxm
- `motion-dom@11.18.1` — Matt Perry
- `motion-utils@11.18.1` — Matt Perry
- `ms@2.0.0`
- `ms@2.1.3`
- `msw@2.10.4` — Artem Zakharchenko
- `mz@2.7.0` — Jonathan Ong
- `nanoid@3.3.11` — Andrey Sitnik
- `no-case@3.0.4` — Blake Embrey
- `node-releases@2.0.19` — Sergey Rubanov
- `normalize-path@3.0.0` — Jon Schlinkert
- `normalize-range@0.1.2` — James Talmage
- `now-and-later@3.0.0` — Gulp Team
- `nwsapi@2.2.21` — Diego Perini
- `object-assign@4.1.1` — Sindre Sorhus
- `object-hash@3.0.0` — Scott Puleo
- `outvariant@1.4.3` — Artem Zakharchenko
- `parent-module@1.0.1` — Sindre Sorhus
- `parse-entities@4.0.2` — Titus Wormer
- `parse-json@5.2.0` — Sindre Sorhus
- `parse5@7.3.0` — Ivan Nikulin
- `parse5-htmlparser2-tree-adapter@7.1.0` — Ivan Nikulin
- `parse5-parser-stream@7.1.2` — Ivan Nikulin
- `path-is-absolute@1.0.1` — Sindre Sorhus
- `path-key@3.1.1` — Sindre Sorhus
- `path-parse@1.0.7` — Javier Blanco
- `path-to-regexp@6.3.0`
- `path-type@4.0.0` — Sindre Sorhus
- `pathe@2.0.3`
- `pathval@2.0.1` — Veselin Todorov
- `picomatch@2.3.1` — Jon Schlinkert
- `picomatch@4.0.3` — Jon Schlinkert
- `pify@2.3.0` — Sindre Sorhus
- `pirates@4.0.7` — Ari Porad
- `postcss@8.5.6` — Andrey Sitnik
- `postcss-import@15.1.0` — Maxime Thirouin
- `postcss-js@4.0.1` — Andrey Sitnik
- `postcss-load-config@4.0.2` — Michael Ciniawky
- `postcss-nested@6.2.0` — Andrey Sitnik
- `postcss-selector-parser@6.0.10`
- `postcss-selector-parser@6.1.2`
- `postcss-value-parser@4.2.0` — Bogdan Chadkin
- `pretty-format@27.5.1` — James Kyle
- `process-nextick-args@2.0.1`
- `promise-map-series@0.3.0` — Jo Liss
- `prop-types@15.8.1`
- `property-information@7.1.0` — Titus Wormer
- `psl@1.15.0` — Lupo Montero
- `punycode@2.3.1` — Mathias Bynens
- `querystringify@2.2.0` — Arnout Kazemier
- `queue-microtask@1.2.3` — Feross Aboukhadijeh
- `quick-temp@0.1.9` — Jo Liss
- `react@18.3.1`
- `react-day-picker@8.10.1` — Giampaolo Bellavite
- `react-dom@18.3.1`
- `react-hook-form@7.62.0` — Beier
- `react-i18next@17.0.13` — Jan Mühlemann
- `react-icons@5.5.0` — Goran Gajic
- `react-is@16.13.1`
- `react-is@17.0.2`
- `react-is@18.3.1`
- `react-markdown@10.1.0` — Espen Hovlandsdal
- `react-number-format@5.4.4` — Sudhanshu Yadav
- `react-refresh@0.17.0`
- `react-remove-scroll@2.7.1` — Anton Korzunov
- `react-remove-scroll-bar@2.3.8` — Anton Korzunov
- `react-resizable-panels@2.1.9` — Brian Vaughn
- `react-smooth@4.0.4` — JasonHzq
- `react-style-singleton@2.2.3` — Anton Korzunov
- `read-cache@1.0.0` — Bogdan Chadkin
- `readable-stream@2.3.8`
- `readable-stream@3.6.2`
- `readdirp@3.6.0` — Thorsten Lorenz
- `recharts@2.15.4` — recharts group
- `recharts-scale@0.4.5` — recharts group
- `redent@3.0.0` — Sindre Sorhus
- `regexparam@3.0.0` — Luke Edwards
- `remark-gfm@4.0.1` — Titus Wormer
- `remark-parse@11.0.0` — Titus Wormer
- `remark-rehype@11.1.2` — Titus Wormer
- `remark-stringify@11.0.0` — Titus Wormer
- `replace-ext@2.0.0` — Gulp Team
- `require-directory@2.1.1` — Troy Goode
- `requires-port@1.0.0` — Arnout Kazemier
- `resolve@1.22.10` — James Halliday
- `resolve-from@4.0.0` — Sindre Sorhus
- `resolve-options@2.0.0` — Gulp Team
- `resolve-pkg-maps@1.0.0` — Hiroki Osame
- `rest-express@1.0.0`
- `reusify@1.1.0` — Matteo Collina
- `rollup@4.46.2` — Rich Harris
- `rrweb-cssom@0.8.0` — Nikita Vasilyev
- `rsvp@3.2.1` — Tilde, Inc. & Stefan Penner
- `rsvp@4.8.5` — Tilde, Inc. & Stefan Penner
- `run-parallel@1.2.0` — Feross Aboukhadijeh
- `safe-buffer@5.1.2` — Feross Aboukhadijeh
- `safer-buffer@2.1.2` — Nikita Skovoroda
- `scheduler@0.23.2`
- `shebang-command@2.0.0` — Kevin Mårtensson
- `shebang-regex@3.0.0` — Sindre Sorhus
- `snake-case@3.0.4` — Blake Embrey
- `sort-keys@5.1.0` — Sindre Sorhus
- `space-separated-tokens@2.0.2` — Titus Wormer
- `stackback@0.0.2` — Roman Shtylman
- `statuses@2.0.2`
- `std-env@3.9.0`
- `stream-composer@1.0.2` — Mathias Buus
- `streamx@2.28.1` — Mathias Buus
- `strict-event-emitter@0.5.1` — Artem Zakharchenko
- `string_decoder@1.1.1`
- `string-width@4.2.3` — Sindre Sorhus
- `string-width@5.1.2` — Sindre Sorhus
- `stringify-entities@4.0.4` — Titus Wormer
- `strip-ansi@6.0.1` — Sindre Sorhus
- `strip-ansi@7.1.0` — Sindre Sorhus
- `strip-indent@3.0.0` — Sindre Sorhus
- `strip-literal@3.0.0` — Anthony Fu
- `style-to-js@1.1.21` — Mark
- `style-to-object@1.0.14` — Mark
- `sucrase@3.35.0` — Alan Pierce
- `supports-color@7.2.0` — Sindre Sorhus
- `supports-preserve-symlinks-flag@1.0.0` — Jordan Harband
- `svg-parser@2.0.4` — Rich Harris
- `symbol-tree@3.2.4` — Joris van der Wel
- `symlink-or-copy@1.3.1` — Jo Liss
- `tailwind-merge@2.6.0` — Dany Castillo
- `tailwindcss@3.4.17`
- `tailwindcss-animate@1.0.7` — Jamie Kyle
- `teex@1.0.1` — Mathias Buus
- `thenify@3.3.1` — Jonathan Ong
- `thenify-all@1.6.0` — Jonathan Ong
- `through2@2.0.5` — Rod Vagg
- `tiny-invariant@1.3.3` — Alex Reardon
- `tinybench@2.9.0`
- `tinyexec@0.3.2` — James Garbutt
- `tinyglobby@0.2.14` — Superchupu
- `tinypool@1.1.1`
- `tinyrainbow@2.0.0`
- `tinyspy@4.0.3`
- `tldts@6.1.86` — Rémi Berson
- `tldts-core@6.1.86` — Rémi Berson
- `to-regex-range@5.0.1` — Jon Schlinkert
- `to-through@3.0.0` — Gulp Team
- `tr46@0.0.3` — Sebastian Mayr
- `tr46@5.1.1` — Sebastian Mayr
- `trim-lines@3.0.1` — Titus Wormer
- `trough@2.2.0` — Titus Wormer
- `tsx@4.20.3` — Hiroki Osame
- `type-fest@0.21.3` — Sindre Sorhus
- `type-fest@4.41.0` — Sindre Sorhus
- `underscore.string@3.3.6`
- `undici@7.29.1`
- `undici-types@6.21.0`
- `unified@11.0.5` — Titus Wormer
- `unist-util-is@6.0.1` — Titus Wormer
- `unist-util-position@5.0.0` — Titus Wormer
- `unist-util-stringify-position@4.0.0` — Titus Wormer
- `unist-util-visit@5.1.0` — Titus Wormer
- `unist-util-visit-parents@6.0.2` — Titus Wormer
- `universalify@0.1.2` — Ryan Zimmerman
- `universalify@0.2.0` — Ryan Zimmerman
- `universalify@2.0.1` — Ryan Zimmerman
- `update-browserslist-db@1.1.3` — Andrey Sitnik
- `url-parse@1.5.10` — Arnout Kazemier
- `use-callback-ref@1.3.3` — theKashey
- `use-sidecar@1.1.3` — theKashey
- `use-sync-external-store@1.7.0`
- `util-deprecate@1.0.2` — Nathan Rajlich
- `value-or-function@4.0.0` — Gulp Team
- `vaul@1.1.2` — Emil Kowalski
- `vfile@6.0.3` — Titus Wormer
- `vfile-message@4.0.3` — Titus Wormer
- `vinyl@3.0.1` — Gulp Team
- `vinyl-contents@2.0.0` — Gulp Team
- `vinyl-fs@4.0.2` — Gulp Team
- `vinyl-sourcemap@2.0.0` — Gulp Team
- `vite@5.4.19` — Evan You
- `vite@7.1.1` — Evan You
- `vite-node@3.2.4` — Anthony Fu
- `vite-plugin-svgr@4.3.0` — Rongjian Zhang
- `vitest@3.2.4` — Anthony Fu
- `w3c-xmlserializer@5.0.0`
- `walk-sync@2.2.0` — Jo Liss
- `whatwg-encoding@3.1.1` — Domenic Denicola
- `whatwg-mimetype@4.0.0` — Domenic Denicola
- `whatwg-url@14.2.0` — Sebastian Mayr
- `whatwg-url@5.0.0` — Sebastian Mayr
- `why-is-node-running@2.3.0` — Mathias Buus
- `wrap-ansi@6.2.0` — Sindre Sorhus
- `wrap-ansi@7.0.0` — Sindre Sorhus
- `wrap-ansi@8.1.0` — Sindre Sorhus
- `ws@8.18.3` — Einar Otto Stangvik
- `xmlchars@2.2.0` — Louis-Dominique Dubeau
- `xtend@4.0.2` — Raynos
- `yargs@17.7.2`
- `yoctocolors-cjs@2.1.2` — Sindre Sorhus
- `zod@3.25.76` — Colin McDonnell
- `zod-validation-error@3.5.3` — Dimitrios C. Michalakos
- `zwitch@2.0.4` — Titus Wormer

### ISC

- `@bundled-es-modules/cookie@2.0.1` — Pascal Schilp
- `@bundled-es-modules/statuses@1.0.1` — Pascal Schilp
- `@bundled-es-modules/tough-cookie@0.1.6`
- `@isaacs/cliui@8.0.2` — Ben Coe
- `@ungap/structured-clone@1.3.0` — Andrea Giammarchi
- `anymatch@3.1.3` — Elan Shanker
- `boolbase@1.0.0` — Felix Boehm
- `cli-width@4.1.0` — Ilya Radchenko
- `cliui@8.0.1` — Ben Coe
- `d3-array@3.2.4` — Mike Bostock
- `d3-color@3.1.0` — Mike Bostock
- `d3-format@3.1.0` — Mike Bostock
- `d3-interpolate@3.0.1` — Mike Bostock
- `d3-path@3.1.0` — Mike Bostock
- `d3-scale@4.0.2` — Mike Bostock
- `d3-shape@3.2.0` — Mike Bostock
- `d3-time@3.1.0` — Mike Bostock
- `d3-time-format@4.1.0` — Mike Bostock
- `d3-timer@3.0.1` — Mike Bostock
- `electron-to-chromium@1.5.199` — Kilian Valkhof
- `ensure-posix-path@1.1.1` — Stefan Penner
- `fastq@1.19.1` — Matteo Collina
- `foreground-child@3.3.1` — Isaac Z. Schlueter
- `fs.realpath@1.0.0` — Isaac Z. Schlueter
- `get-caller-file@2.0.5` — Stefan Penner
- `glob@10.4.5` — Isaac Z. Schlueter
- `glob@7.2.3` — Isaac Z. Schlueter
- `glob-parent@5.1.2` — Gulp Team
- `glob-parent@6.0.2` — Gulp Team
- `graceful-fs@4.2.11`
- `inflight@1.0.6` — Isaac Z. Schlueter
- `inherits@2.0.4`
- `internmap@2.0.3` — Mike Bostock
- `isexe@2.0.0` — Isaac Z. Schlueter
- `lru-cache@10.4.3` — Isaac Z. Schlueter
- `lru-cache@5.1.1` — Isaac Z. Schlueter
- `lucide-react@0.453.0` — Eric Fennis
- `matcher-collection@2.0.1` — Stefan Penner
- `minimatch@3.1.5` — Isaac Z. Schlueter
- `minimatch@9.0.5` — Isaac Z. Schlueter
- `minipass@7.1.2` — Isaac Z. Schlueter
- `mute-stream@2.0.0` — GitHub Inc.
- `once@1.4.0` — Isaac Z. Schlueter
- `path-posix@1.0.0` — jden
- `picocolors@1.1.1` — Alexey Raspopov
- `remove-trailing-separator@1.1.0` — darsain
- `rimraf@3.0.2` — Isaac Z. Schlueter
- `rimraf@5.0.10` — Isaac Z. Schlueter
- `saxes@6.0.0` — Louis-Dominique Dubeau
- `semver@6.3.1` — GitHub Inc.
- `semver@7.7.2` — GitHub Inc.
- `siginfo@2.0.0` — Emil Bay
- `signal-exit@4.1.0` — Ben Coe
- `test-exclude@7.0.1` — Ben Coe
- `victory-vendor@36.9.2` — Formidable
- `which@2.0.2` — Isaac Z. Schlueter
- `wrappy@1.0.2` — Isaac Z. Schlueter
- `y18n@5.0.8` — Ben Coe
- `yallist@3.1.1` — Isaac Z. Schlueter
- `yaml@2.8.1` — Eemeli Aro
- `yargs-parser@21.1.1` — Ben Coe

### Apache-2.0

- `@ampproject/remapping@2.3.0` — Justin Ridgewell
- `aria-query@5.3.0` — Jesse Beach
- `b4a@1.8.1` — Holepunch
- `bare-events@2.9.2` — Holepunch
- `class-variance-authority@0.7.1` — Joe Bell
- `didyoumean@1.2.2` — Dave Porter
- `drizzle-orm@0.44.4` — Drizzle Team
- `drizzle-zod@0.8.3` — Drizzle Team
- `events-universal@1.0.1` — Holepunch
- `expect-type@1.2.2`
- `text-decoder@1.2.7` — Holepunch
- `ts-interface-checker@0.1.13` — Dmitry S, Grist Labs
- `typescript@5.6.3` — Microsoft Corp.
- `xml-name-validator@5.0.0` — Domenic Denicola

### BSD-2-Clause

- `cheerio-select@2.1.0` — Felix Boehm
- `css-select@5.2.2` — Felix Boehm
- `css-what@6.2.2` — Felix Böhm
- `domelementtype@2.3.0` — Felix Boehm
- `domhandler@5.0.3` — Felix Boehm
- `domutils@3.2.2` — Felix Boehm
- `entities@4.5.0` — Felix Boehm
- `entities@6.0.1` — Felix Boehm
- `entities@7.0.1` — Felix Boehm
- `nth-check@2.1.1` — Felix Boehm
- `webidl-conversions@3.0.1` — Domenic Denicola
- `webidl-conversions@7.0.0` — Domenic Denicola

### BSD-3-Clause

- `d3-ease@3.0.1` — Mike Bostock
- `ieee754@1.2.1` — Feross Aboukhadijeh
- `istanbul-lib-coverage@3.2.2` — Krishnan Anantheswaran
- `istanbul-lib-report@3.0.1` — Krishnan Anantheswaran
- `istanbul-lib-source-maps@5.0.6` — Krishnan Anantheswaran
- `istanbul-reports@3.1.7` — Krishnan Anantheswaran
- `react-transition-group@4.4.5`
- `source-map-js@1.2.1` — Valentin 7rulnik Semirulnik
- `sprintf-js@1.1.3` — Alexandru Mărășteanu
- `tough-cookie@4.1.4` — Jeremy Stashewsky
- `tough-cookie@5.1.2` — Jeremy Stashewsky

### BlueOak-1.0.0

- `jackspeak@3.4.3` — Isaac Z. Schlueter
- `package-json-from-dist@1.0.1` — Isaac Z. Schlueter
- `path-scurry@1.11.1` — Isaac Z. Schlueter

### MIT-0

- `@csstools/color-helpers@5.0.2`

### Python-2.0

- `argparse@2.0.1`

### CC-BY-4.0

- `caniuse-lite@1.0.30001733` — Ben Briggs

### 0BSD

- `tslib@2.8.1` — Microsoft Corp.

### Unlicense

- `wouter@3.7.1` — Alexey Taktarov

## Python dependencies — statement importer (importer/)

### MIT

- `annotated-types@0.7.0` — Adrian Garcia Badaracco 1755071+adriangb@users.noreply.github.com
- `anyio@4.14.1` — Alex Grönholm alex.gronholm@nextday.fi
- `cffi@2.0.0` — Armin Rigo, Maciej Fijalkowski
- `charset-normalizer@3.4.7` — "Ahmed R. TAHRI" tahri.ahmed@proton.me
- `et_xmlfile@2.0.0` — charlie.clark@clark-consulting.eu
- `fastapi@0.116.1`
- `h11@0.16.0` — njs@pobox.com
- `iniconfig@2.3.0` — Ronny Pfannschmidt opensource@ronnypfannschmidt.de
- `jiter@0.15.0` — Samuel Colvin s@muelcolvin.com
- `openpyxl@3.1.5` — charlie.clark@clark-consulting.eu
- `pdfminer.six@20250506` — Philippe Guglielmetti pdfminer@goulu.net
- `pdfplumber@0.11.7` — jsvine@gmail.com
- `pip@24.0` — The pip developers distutils-sig@python.org
- `pluggy@1.6.0` — Holger Krekel holger@merlinux.eu
- `pydantic@2.13.4` — Samuel Colvin s@muelcolvin.com
- `pydantic_core@2.46.4` — Samuel Colvin s@muelcolvin.com
- `PyJWT@2.9.0` — hello@jpadilla.com
- `pytest@8.4.1` — Holger Krekel, Bruno Oliveira, Ronny Pfannschmidt, Floris Bruynooghe, Brianna Laugher, Florian Bruhin, Others See AUTHORS
- `six@1.17.0` — benjamin@python.org
- `typing-inspection@0.4.2` — Victorien Plot contact@vctrn.dev

### BSD-3-Clause

- `click@8.4.2`
- `httpcore@1.0.9` — Tom Christie tom@tomchristie.com
- `httpx@0.28.1` — Tom Christie tom@tomchristie.com
- `idna@3.18` — Kim Davies kim+pypi@gumleaf.org
- `pycparser@3.0` — Eli Bendersky eliben@gmail.com
- `python-dateutil@2.9.0.post0` — gustavo@niemeyer.net
- `python-dotenv@1.1.1` — me+github@saurabh-kumar.com
- `starlette@0.47.3` — Tom Christie tom@tomchristie.com
- `uvicorn@0.32.1` — Tom Christie tom@tomchristie.com
- `xlrd@2.0.2` — chris@withers.org

### Apache-2.0

- `cryptography@49.0.0` — The Python Cryptographic Authority and individual contributors cryptography-dev@python.org
- `distro@1.9.0` — nir36g@gmail.com
- `openai@1.98.0` — OpenAI support@openai.com
- `packaging@26.2` — Donald Stufft donald@stufft.io
- `pypdfium2@5.10.1` — geisserml@gmail.com
- `pytest-asyncio@0.24.0` — tinchester@gmail.com
- `python-multipart@0.0.12` — Andrew Dunham andrew@du.nham.ca
- `sniffio@1.3.1` — "Nathaniel J. Smith" njs@pobox.com

### PSF-2.0

- `defusedxml@0.7.1` — christian@python.org
- `typing_extensions@4.15.0` — "Guido van Rossum

### BSD-2-Clause

- `Pygments@2.20.0` — Georg Brandl georg@python.org
- `xlsxwriter@3.2.5` — jmcnamara@cpan.org

### MPL-2.0

- `certifi@2026.6.17` — me@kennethreitz.com

### MIT-CMU

- `pillow@12.2.0` — Jeffrey 'Alex' Clark aclark@aclark.net

### LGPL-3.0

- `psycopg2-binary@2.9.10` — fog@initd.org

### MPL-2.0 AND MIT

- `tqdm@4.68.3`

## Python dependencies — MCP server (mcp/)

### MIT

- `annotated-doc@0.0.5`
- `annotated-types@0.8.0` — Adrian Garcia Badaracco 1755071+adriangb@users.noreply.github.com
- `anyio@4.15.1` — Alex Grönholm alex.gronholm@nextday.fi
- `attrs@26.1.0` — Hynek Schlawack hs@ox.cx
- `h11@0.16.0` — njs@pobox.com
- `httpx-sse@0.4.3` — Florimond Manca florimond.manca@protonmail.com
- `iniconfig@2.3.0` — Ronny Pfannschmidt opensource@ronnypfannschmidt.de
- `jsonschema@4.26.0` — Julian Berman Julian+jsonschema@GrayVines.com
- `jsonschema-specifications@2025.9.1` — Julian Berman Julian+jsonschema-specifications@GrayVines.com
- `markdown-it-py@4.2.0` — Chris Sewell chrisj_sewell@hotmail.com
- `mcp@1.19.0` — Anthropic, PBC.
- `mdurl@0.1.2` — Taneli Hukkinen hukkin@users.noreply.github.com
- `pip@24.0` — The pip developers distutils-sig@python.org
- `pluggy@1.6.0` — Holger Krekel holger@merlinux.eu
- `pydantic@2.13.5` — Samuel Colvin s@muelcolvin.com
- `pydantic_core@2.46.5` — Samuel Colvin s@muelcolvin.com
- `pydantic-settings@2.15.0` — Samuel Colvin s@muelcolvin.com
- `PyJWT@2.9.0` — hello@jpadilla.com
- `pytest@8.4.1` — Holger Krekel, Bruno Oliveira, Ronny Pfannschmidt, Floris Bruynooghe, Brianna Laugher, Florian Bruhin, Others See AUTHORS
- `referencing@0.37.0` — Julian Berman Julian+referencing@GrayVines.com
- `rich@15.0.0` — willmcgugan@gmail.com
- `rpds-py@2026.6.3` — Julian Berman Julian+rpds@GrayVines.com
- `typer@0.27.2`
- `typing-inspection@0.4.4` — Victorien Plot contact@vctrn.dev

### BSD-3-Clause

- `click@8.5.0`
- `httpcore@1.0.9` — Tom Christie tom@tomchristie.com
- `httpx@0.27.2` — Tom Christie tom@tomchristie.com
- `idna@3.19` — Kim Davies kim+pypi@gumleaf.org
- `python-dotenv@1.2.3` — Saurabh Kumar me+github@saurabh-kumar.com
- `sse-starlette@3.4.11` — sysid sysid@gmx.de
- `starlette@1.6.0` — Tom Christie tom@tomchristie.com
- `uvicorn@0.32.1` — Tom Christie tom@tomchristie.com

### Apache-2.0

- `packaging@26.3` — Donald Stufft donald@stufft.io
- `pytest-asyncio@0.24.0` — tinchester@gmail.com
- `python-multipart@0.0.32` — Andrew Dunham andrew@du.nham.ca
- `sniffio@1.3.1` — "Nathaniel J. Smith" njs@pobox.com

### MPL-2.0

- `certifi@2026.7.22` — me@kennethreitz.com

### LGPL-3.0

- `psycopg2-binary@2.9.10` — fog@initd.org

### BSD-2-Clause

- `Pygments@2.21.0` — Georg Brandl georg@python.org

### ISC

- `shellingham@1.5.4` — uranusjr@gmail.com

### PSF-2.0

- `typing_extensions@4.16.0` — "Guido van Rossum

---

# License texts

## 0BSD

```text
BSD Zero Clause License

Copyright (c) <year> <copyright holders>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```

## Apache-2.0

```text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

## BSD-2-Clause

```text
BSD 2-Clause License

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
POSSIBILITY OF SUCH DAMAGE.
```

## BSD-3-Clause

```text
BSD 3-Clause License

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
POSSIBILITY OF SUCH DAMAGE.
```

## BlueOak-1.0.0

```text
# Blue Oak Model License

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
to this software or this license, under any kind of legal claim.
```

## CC-BY-4.0

```text
Attribution 4.0 International

=======================================================================

Creative Commons Corporation ("Creative Commons") is not a law firm and
does not provide legal services or legal advice. Distribution of
Creative Commons public licenses does not create a lawyer-client or
other relationship. Creative Commons makes its licenses and related
information available on an "as-is" basis. Creative Commons gives no
warranties regarding its licenses, any material licensed under their
terms and conditions, or any related information. Creative Commons
disclaims all liability for damages resulting from their use to the
fullest extent possible.

Using Creative Commons Public Licenses

Creative Commons public licenses provide a standard set of terms and
conditions that creators and other rights holders may use to share
original works of authorship and other material subject to copyright
and certain other rights specified in the public license below. The
following considerations are for informational purposes only, are not
exhaustive, and do not form part of our licenses.

     Considerations for licensors: Our public licenses are
     intended for use by those authorized to give the public
     permission to use material in ways otherwise restricted by
     copyright and certain other rights. Our licenses are
     irrevocable. Licensors should read and understand the terms
     and conditions of the license they choose before applying it.
     Licensors should also secure all rights necessary before
     applying our licenses so that the public can reuse the
     material as expected. Licensors should clearly mark any
     material not subject to the license. This includes other CC-
     licensed material, or material used under an exception or
     limitation to copyright. More considerations for licensors:
	wiki.creativecommons.org/Considerations_for_licensors

     Considerations for the public: By using one of our public
     licenses, a licensor grants the public permission to use the
     licensed material under specified terms and conditions. If
     the licensor's permission is not necessary for any reason--for
     example, because of any applicable exception or limitation to
     copyright--then that use is not regulated by the license. Our
     licenses grant only permissions under copyright and certain
     other rights that a licensor has authority to grant. Use of
     the licensed material may still be restricted for other
     reasons, including because others have copyright or other
     rights in the material. A licensor may make special requests,
     such as asking that all changes be marked or described.
     Although not required by our licenses, you are encouraged to
     respect those requests where reasonable. More_considerations
     for the public: 
	wiki.creativecommons.org/Considerations_for_licensees

=======================================================================

Creative Commons Attribution 4.0 International Public License

By exercising the Licensed Rights (defined below), You accept and agree
to be bound by the terms and conditions of this Creative Commons
Attribution 4.0 International Public License ("Public License"). To the
extent this Public License may be interpreted as a contract, You are
granted the Licensed Rights in consideration of Your acceptance of
these terms and conditions, and the Licensor grants You such rights in
consideration of benefits the Licensor receives from making the
Licensed Material available under these terms and conditions.


Section 1 -- Definitions.

  a. Adapted Material means material subject to Copyright and Similar
     Rights that is derived from or based upon the Licensed Material
     and in which the Licensed Material is translated, altered,
     arranged, transformed, or otherwise modified in a manner requiring
     permission under the Copyright and Similar Rights held by the
     Licensor. For purposes of this Public License, where the Licensed
     Material is a musical work, performance, or sound recording,
     Adapted Material is always produced where the Licensed Material is
     synched in timed relation with a moving image.

  b. Adapter's License means the license You apply to Your Copyright
     and Similar Rights in Your contributions to Adapted Material in
     accordance with the terms and conditions of this Public License.

  c. Copyright and Similar Rights means copyright and/or similar rights
     closely related to copyright including, without limitation,
     performance, broadcast, sound recording, and Sui Generis Database
     Rights, without regard to how the rights are labeled or
     categorized. For purposes of this Public License, the rights
     specified in Section 2(b)(1)-(2) are not Copyright and Similar
     Rights.

  d. Effective Technological Measures means those measures that, in the
     absence of proper authority, may not be circumvented under laws
     fulfilling obligations under Article 11 of the WIPO Copyright
     Treaty adopted on December 20, 1996, and/or similar international
     agreements.

  e. Exceptions and Limitations means fair use, fair dealing, and/or
     any other exception or limitation to Copyright and Similar Rights
     that applies to Your use of the Licensed Material.

  f. Licensed Material means the artistic or literary work, database,
     or other material to which the Licensor applied this Public
     License.

  g. Licensed Rights means the rights granted to You subject to the
     terms and conditions of this Public License, which are limited to
     all Copyright and Similar Rights that apply to Your use of the
     Licensed Material and that the Licensor has authority to license.

  h. Licensor means the individual(s) or entity(ies) granting rights
     under this Public License.

  i. Share means to provide material to the public by any means or
     process that requires permission under the Licensed Rights, such
     as reproduction, public display, public performance, distribution,
     dissemination, communication, or importation, and to make material
     available to the public including in ways that members of the
     public may access the material from a place and at a time
     individually chosen by them.

  j. Sui Generis Database Rights means rights other than copyright
     resulting from Directive 96/9/EC of the European Parliament and of
     the Council of 11 March 1996 on the legal protection of databases,
     as amended and/or succeeded, as well as other essentially
     equivalent rights anywhere in the world.

  k. You means the individual or entity exercising the Licensed Rights
     under this Public License. Your has a corresponding meaning.


Section 2 -- Scope.

  a. License grant.

       1. Subject to the terms and conditions of this Public License,
          the Licensor hereby grants You a worldwide, royalty-free,
          non-sublicensable, non-exclusive, irrevocable license to
          exercise the Licensed Rights in the Licensed Material to:

            a. reproduce and Share the Licensed Material, in whole or
               in part; and

            b. produce, reproduce, and Share Adapted Material.

       2. Exceptions and Limitations. For the avoidance of doubt, where
          Exceptions and Limitations apply to Your use, this Public
          License does not apply, and You do not need to comply with
          its terms and conditions.

       3. Term. The term of this Public License is specified in Section
          6(a).

       4. Media and formats; technical modifications allowed. The
          Licensor authorizes You to exercise the Licensed Rights in
          all media and formats whether now known or hereafter created,
          and to make technical modifications necessary to do so. The
          Licensor waives and/or agrees not to assert any right or
          authority to forbid You from making technical modifications
          necessary to exercise the Licensed Rights, including
          technical modifications necessary to circumvent Effective
          Technological Measures. For purposes of this Public License,
          simply making modifications authorized by this Section 2(a)
          (4) never produces Adapted Material.

       5. Downstream recipients.

            a. Offer from the Licensor -- Licensed Material. Every
               recipient of the Licensed Material automatically
               receives an offer from the Licensor to exercise the
               Licensed Rights under the terms and conditions of this
               Public License.

            b. No downstream restrictions. You may not offer or impose
               any additional or different terms or conditions on, or
               apply any Effective Technological Measures to, the
               Licensed Material if doing so restricts exercise of the
               Licensed Rights by any recipient of the Licensed
               Material.

       6. No endorsement. Nothing in this Public License constitutes or
          may be construed as permission to assert or imply that You
          are, or that Your use of the Licensed Material is, connected
          with, or sponsored, endorsed, or granted official status by,
          the Licensor or others designated to receive attribution as
          provided in Section 3(a)(1)(A)(i).

  b. Other rights.

       1. Moral rights, such as the right of integrity, are not
          licensed under this Public License, nor are publicity,
          privacy, and/or other similar personality rights; however, to
          the extent possible, the Licensor waives and/or agrees not to
          assert any such rights held by the Licensor to the limited
          extent necessary to allow You to exercise the Licensed
          Rights, but not otherwise.

       2. Patent and trademark rights are not licensed under this
          Public License.

       3. To the extent possible, the Licensor waives any right to
          collect royalties from You for the exercise of the Licensed
          Rights, whether directly or through a collecting society
          under any voluntary or waivable statutory or compulsory
          licensing scheme. In all other cases the Licensor expressly
          reserves any right to collect such royalties.


Section 3 -- License Conditions.

Your exercise of the Licensed Rights is expressly made subject to the
following conditions.

  a. Attribution.

       1. If You Share the Licensed Material (including in modified
          form), You must:

            a. retain the following if it is supplied by the Licensor
               with the Licensed Material:

                 i. identification of the creator(s) of the Licensed
                    Material and any others designated to receive
                    attribution, in any reasonable manner requested by
                    the Licensor (including by pseudonym if
                    designated);

                ii. a copyright notice;

               iii. a notice that refers to this Public License;

                iv. a notice that refers to the disclaimer of
                    warranties;

                 v. a URI or hyperlink to the Licensed Material to the
                    extent reasonably practicable;

            b. indicate if You modified the Licensed Material and
               retain an indication of any previous modifications; and

            c. indicate the Licensed Material is licensed under this
               Public License, and include the text of, or the URI or
               hyperlink to, this Public License.

       2. You may satisfy the conditions in Section 3(a)(1) in any
          reasonable manner based on the medium, means, and context in
          which You Share the Licensed Material. For example, it may be
          reasonable to satisfy the conditions by providing a URI or
          hyperlink to a resource that includes the required
          information.

       3. If requested by the Licensor, You must remove any of the
          information required by Section 3(a)(1)(A) to the extent
          reasonably practicable.

       4. If You Share Adapted Material You produce, the Adapter's
          License You apply must not prevent recipients of the Adapted
          Material from complying with this Public License.


Section 4 -- Sui Generis Database Rights.

Where the Licensed Rights include Sui Generis Database Rights that
apply to Your use of the Licensed Material:

  a. for the avoidance of doubt, Section 2(a)(1) grants You the right
     to extract, reuse, reproduce, and Share all or a substantial
     portion of the contents of the database;

  b. if You include all or a substantial portion of the database
     contents in a database in which You have Sui Generis Database
     Rights, then the database in which You have Sui Generis Database
     Rights (but not its individual contents) is Adapted Material; and

  c. You must comply with the conditions in Section 3(a) if You Share
     all or a substantial portion of the contents of the database.

For the avoidance of doubt, this Section 4 supplements and does not
replace Your obligations under this Public License where the Licensed
Rights include other Copyright and Similar Rights.


Section 5 -- Disclaimer of Warranties and Limitation of Liability.

  a. UNLESS OTHERWISE SEPARATELY UNDERTAKEN BY THE LICENSOR, TO THE
     EXTENT POSSIBLE, THE LICENSOR OFFERS THE LICENSED MATERIAL AS-IS
     AND AS-AVAILABLE, AND MAKES NO REPRESENTATIONS OR WARRANTIES OF
     ANY KIND CONCERNING THE LICENSED MATERIAL, WHETHER EXPRESS,
     IMPLIED, STATUTORY, OR OTHER. THIS INCLUDES, WITHOUT LIMITATION,
     WARRANTIES OF TITLE, MERCHANTABILITY, FITNESS FOR A PARTICULAR
     PURPOSE, NON-INFRINGEMENT, ABSENCE OF LATENT OR OTHER DEFECTS,
     ACCURACY, OR THE PRESENCE OR ABSENCE OF ERRORS, WHETHER OR NOT
     KNOWN OR DISCOVERABLE. WHERE DISCLAIMERS OF WARRANTIES ARE NOT
     ALLOWED IN FULL OR IN PART, THIS DISCLAIMER MAY NOT APPLY TO YOU.

  b. TO THE EXTENT POSSIBLE, IN NO EVENT WILL THE LICENSOR BE LIABLE
     TO YOU ON ANY LEGAL THEORY (INCLUDING, WITHOUT LIMITATION,
     NEGLIGENCE) OR OTHERWISE FOR ANY DIRECT, SPECIAL, INDIRECT,
     INCIDENTAL, CONSEQUENTIAL, PUNITIVE, EXEMPLARY, OR OTHER LOSSES,
     COSTS, EXPENSES, OR DAMAGES ARISING OUT OF THIS PUBLIC LICENSE OR
     USE OF THE LICENSED MATERIAL, EVEN IF THE LICENSOR HAS BEEN
     ADVISED OF THE POSSIBILITY OF SUCH LOSSES, COSTS, EXPENSES, OR
     DAMAGES. WHERE A LIMITATION OF LIABILITY IS NOT ALLOWED IN FULL OR
     IN PART, THIS LIMITATION MAY NOT APPLY TO YOU.

  c. The disclaimer of warranties and limitation of liability provided
     above shall be interpreted in a manner that, to the extent
     possible, most closely approximates an absolute disclaimer and
     waiver of all liability.


Section 6 -- Term and Termination.

  a. This Public License applies for the term of the Copyright and
     Similar Rights licensed here. However, if You fail to comply with
     this Public License, then Your rights under this Public License
     terminate automatically.

  b. Where Your right to use the Licensed Material has terminated under
     Section 6(a), it reinstates:

       1. automatically as of the date the violation is cured, provided
          it is cured within 30 days of Your discovery of the
          violation; or

       2. upon express reinstatement by the Licensor.

     For the avoidance of doubt, this Section 6(b) does not affect any
     right the Licensor may have to seek remedies for Your violations
     of this Public License.

  c. For the avoidance of doubt, the Licensor may also offer the
     Licensed Material under separate terms or conditions or stop
     distributing the Licensed Material at any time; however, doing so
     will not terminate this Public License.

  d. Sections 1, 5, 6, 7, and 8 survive termination of this Public
     License.


Section 7 -- Other Terms and Conditions.

  a. The Licensor shall not be bound by any additional or different
     terms or conditions communicated by You unless expressly agreed.

  b. Any arrangements, understandings, or agreements regarding the
     Licensed Material not stated herein are separate from and
     independent of the terms and conditions of this Public License.


Section 8 -- Interpretation.

  a. For the avoidance of doubt, this Public License does not, and
     shall not be interpreted to, reduce, limit, restrict, or impose
     conditions on any use of the Licensed Material that could lawfully
     be made without permission under this Public License.

  b. To the extent possible, if any provision of this Public License is
     deemed unenforceable, it shall be automatically reformed to the
     minimum extent necessary to make it enforceable. If the provision
     cannot be reformed, it shall be severed from this Public License
     without affecting the enforceability of the remaining terms and
     conditions.

  c. No term or condition of this Public License will be waived and no
     failure to comply consented to unless expressly agreed to by the
     Licensor.

  d. Nothing in this Public License constitutes or may be interpreted
     as a limitation upon, or waiver of, any privileges and immunities
     that apply to the Licensor or You, including from the legal
     processes of any jurisdiction or authority.


=======================================================================

Creative Commons is not a party to its public
licenses. Notwithstanding, Creative Commons may elect to apply one of
its public licenses to material it publishes and in those instances
will be considered the “Licensor.” The text of the Creative Commons
public licenses is dedicated to the public domain under the CC0 Public
Domain Dedication. Except for the limited purpose of indicating that
material is shared under a Creative Commons public license or as
otherwise permitted by the Creative Commons policies published at
creativecommons.org/policies, Creative Commons does not authorize the
use of the trademark "Creative Commons" or any other trademark or logo
of Creative Commons without its prior written consent including,
without limitation, in connection with any unauthorized modifications
to any of its public licenses or any other arrangements,
understandings, or agreements concerning use of licensed material. For
the avoidance of doubt, this paragraph does not form part of the
public licenses.

Creative Commons may be contacted at creativecommons.org.
```

## ISC

```text
ISC License

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
PERFORMANCE OF THIS SOFTWARE.
```

## LGPL-3.0

```text
psycopg2 and the LGPL
---------------------

psycopg2 is free software: you can redistribute it and/or modify it
under the terms of the GNU Lesser General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

psycopg2 is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Lesser General Public
License for more details.

In addition, as a special exception, the copyright holders give
permission to link this program with the OpenSSL library (or with
modified versions of OpenSSL that use the same license as OpenSSL),
and distribute linked combinations including the two.

You must obey the GNU Lesser General Public License in all respects for
all of the code used other than OpenSSL. If you modify file(s) with this
exception, you may extend this exception to your version of the file(s),
but you are not obligated to do so. If you do not wish to do so, delete
this exception statement from your version. If you delete this exception
statement from all source files in the program, then also delete it here.

You should have received a copy of the GNU Lesser General Public License
along with psycopg2 (see the doc/ directory.)
If not, see <https://www.gnu.org/licenses/>.


Alternative licenses
--------------------

The following BSD-like license applies (at your option) to the files following
the pattern ``psycopg/adapter*.{h,c}`` and ``psycopg/microprotocol*.{h,c}``:

 Permission is granted to anyone to use this software for any purpose,
 including commercial applications, and to alter it and redistribute it
 freely, subject to the following restrictions:

 1. The origin of this software must not be misrepresented; you must not
    claim that you wrote the original software. If you use this
    software in a product, an acknowledgment in the product documentation
    would be appreciated but is not required.

 2. Altered source versions must be plainly marked as such, and must not
    be misrepresented as being the original software.

 3. This notice may not be removed or altered from any source distribution.
```

## MIT

```text
MIT License

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
SOFTWARE.
```

## MIT-0

```text
MIT No Attribution License

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
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## MIT-CMU

Full text: https://raw.githubusercontent.com/python-pillow/Pillow/main/LICENSE

## MPL-2.0

Full text: https://www.mozilla.org/media/MPL/2.0/index.txt

## MPL-2.0 AND MIT

Full text: https://www.mozilla.org/media/MPL/2.0/index.txt

## PSF-2.0

```text
PYTHON SOFTWARE FOUNDATION LICENSE VERSION 2

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
bound by the terms and conditions of this License Agreement.
```

## Python-2.0

```text
PYTHON SOFTWARE FOUNDATION LICENSE VERSION 2

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
```

## Unlicense

```text
This is free and unencumbered software released into the public domain.

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

For more information, please refer to <https://unlicense.org>
```

