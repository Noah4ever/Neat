import { HashRouter } from "react-router-dom";
import { AppToaster } from "./components/AppToaster";
import { MachineApplication } from "./MachineApplication";

export default function MachineRoot() {
  return (
    <>
      <HashRouter>
        <MachineApplication />
      </HashRouter>
      <AppToaster />
    </>
  );
}
