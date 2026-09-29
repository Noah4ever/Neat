import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export function LandingPage() {
  return <main>
    <section className="hero">
      <div className="hero-copy">
        <h1>Neat makes the drinks. You enjoy the evening.</h1>
        <p>Collect drink wishes with one link, prepare exactly what you need, and connect the cocktail machine when it arrives.</p>
        <div className="hero-actions"><Link className="primary" to="/new">Start planning <ArrowRight /></Link><a className="text-link" href="#how">How it works</a></div>
      </div>
      <div className="machine-visual"><img alt="Neat cocktail machine" src="/assets/neat-machine.jpg" /></div>
    </section>
    <section className="steps" id="how">
      <h2>From the first idea to the first drink.</h2>
      <div className="story-list">
        <article><b>1</b><div><h3>Share a link</h3><p>Your guests tap every cocktail they would enjoy. No account and no complicated form.</p></div></article>
        <article><b>2</b><div><h3>Shop with a real list</h3><p>Neat combines the recipes, adds a sensible reserve, and tells you how many bottles you need.</p></div></article>
        <article><b>3</b><div><h3>Connect the machine</h3><p>When Neat is online, every phone request appears directly in the queue. An offline pack carries recipes and images when there is no internet.</p></div></article>
      </div>
    </section>
    <section className="craft"><img alt="Neat hardware prototype" src="/assets/neat-machine.jpg" /><div><h2>Built from the pump up.</h2><p>Neat is an ESP32-C6 cocktail machine with calibrated pumps, local controls, and a web experience designed around the people using it.</p><div className="model-links"><a href="/models/neat.usdz">View the machine in AR</a><a href="/models/neat_without_backwall.usdz">Open the internal model</a></div></div></section>
    <section className="closing"><h2>See what everyone wants.</h2><p>Create a list now. Connect Neat later.</p><Link className="primary" to="/new">Start planning <ArrowRight /></Link></section>
  </main>;
}
