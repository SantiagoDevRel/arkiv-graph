import { Showcase } from "./showcase";
export default function Page() {
  return <main className="wrap">
    <Showcase />
    <footer className="foot"><span>arkiv-graph · Explore your Arkiv entities.</span><nav aria-label="Resources"><a href="https://www.npmjs.com/package/arkiv-graph" target="_blank" rel="noreferrer">npm ↗</a><a href="https://github.com/SantiagoDevRel/arkiv-graph" target="_blank" rel="noreferrer">Source and guide ↗</a></nav><small>These packages are intended for testnet use.</small></footer>
  </main>;
}
