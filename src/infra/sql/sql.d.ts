// SQL files are imported as their text, which the bundler and tests both provide.
declare module "*.sql" {
  const text: string;
  export default text;
}
