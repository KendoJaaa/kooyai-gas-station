declare const __MONGODB_URI__: string
declare const __MONGODB_DB__: string

declare module '*.ps1?raw' {
  const source: string
  export default source
}
