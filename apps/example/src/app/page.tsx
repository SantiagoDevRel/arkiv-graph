import { Showcase } from "./showcase";
export default function Page() {
  return <main className="wrap">
    <Showcase />
    <footer className="foot"><span>arkiv-graph · Explora tus Arkiv entities.</span><nav aria-label="Recursos"><a href="https://www.npmjs.com/package/arkiv-graph" target="_blank" rel="noreferrer">npm ↗</a><a href="https://github.com/SantiagoDevRel/arkiv-graph" target="_blank" rel="noreferrer">Código y guía ↗</a></nav><small>These packages are intended for testnet use.</small></footer>
  </main>;
}
