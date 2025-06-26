export const tests = {
  exact: (name: string) => (n: string) => n === name,
  prefix: (prefix: string) => (n: string) => n.startsWith(prefix),
  suffix: (suffix: string) => (n: string) => n.endsWith(suffix),
  regex: (re: RegExp) => (n: string) => re.test(n),
  any: () => () => true,
};
