const functions = ['t', 'i18next.t', 'i18n.t', 'tKey'];

module.exports = {
  input: ['client/src/**/*.{ts,tsx}', '!client/src/**/*.test.{ts,tsx}'],
  output: 'client/src/locales/$LOCALE.json',
  locales: ['en', 'pt-BR'],
  defaultNamespace: 'translation',
  keySeparator: false,
  namespaceSeparator: false,
  defaultValue: '',
  keepRemoved: false,
  sort: true,
  lexers: {
    ts: [{ lexer: 'JavascriptLexer', functions }],
    tsx: [{ lexer: 'JsxLexer', functions }],
  },
};
