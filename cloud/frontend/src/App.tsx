import { Route, Routes } from "react-router-dom";
import { SiteHeader } from "./components/SiteHeader";
import { CreateEventPage } from "./pages/CreateEventPage";
import { EventPage } from "./pages/EventPage";
import { HostPage } from "./pages/HostPage";
import { LandingPage } from "./pages/LandingPage";
import { MachineQueuePage } from "./pages/MachineQueuePage";

export function App() {
  return <div className="site-shell"><SiteHeader /><Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/new" element={<CreateEventPage />} />
    <Route path="/e/:slug" element={<EventPage />} />
    <Route path="/e/:slug/host" element={<HostPage />} />
    <Route path="/m/:machineId" element={<MachineQueuePage />} />
  </Routes></div>;
}
