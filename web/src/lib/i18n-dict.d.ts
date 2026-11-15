// One language's dictionary, served by the build (shared/src/i18n/vite-plugin.ts).
declare module 'virtual:curahold-dict/*' {
  const dictionary: Partial<Record<import('../../../shared/src/i18n/core').MessageKey, string>>;
  export default dictionary;
}
