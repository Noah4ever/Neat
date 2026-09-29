import { Link } from "react-router-dom";

export function SiteHeader() {
  return <header className="site-header"><Link className="wordmark" to="/">Neat</Link><nav><a href="/#story">The machine</a><Link className="header-action" to="/new">Plan an event</Link></nav></header>;
}
