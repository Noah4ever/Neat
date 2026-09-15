import { useState } from "react";
import { Info } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Modal } from "./Modal";

interface PageHelp {
  title: string;
  description: string;
  steps: string[];
}

function helpFor(path: string): PageHelp {
  if (path === "/")
    return {
      title: "Choose a cocktail",
      description: "Browse every drink Neat can currently make.",
      steps: ["Search by name.", "Tap a cocktail to choose size and strength."],
    };
  if (path.startsWith("/prepare/"))
    return {
      title: "Prepare your drink",
      description: "Choose how Neat should make this cocktail.",
      steps: [
        "Choose a size and alcohol strength.",
        "Add the listed preparation items to your glass before mixing.",
        "Place your glass below the dispenser and tap Make drink.",
      ],
    };
  if (path === "/progress")
    return {
      title: "Drink in progress",
      description: "This screen shows what Neat is dispensing right now.",
      steps: [
        "Finished ingredients receive a checkmark.",
        "You can browse other drinks or stop the current operation.",
      ],
    };
  if (path.includes("/recipes/"))
    return {
      title: "Edit recipe",
      description: "Define the ingredients and amounts for this cocktail.",
      steps: ["Add ingredients in the intended amounts, then save the recipe."],
    };
  if (path.endsWith("/recipes"))
    return {
      title: "Recipes",
      description: "Create and maintain the cocktails Neat can make.",
      steps: ["Tap a recipe to edit it or use Add recipe to create one."],
    };
  if (path.endsWith("/ingredients"))
    return {
      title: "Ingredients",
      description: "Manage the liquids used by pumps and recipes.",
      steps: ["Add ingredients here before assigning them to a pump or recipe."],
    };
  if (path.endsWith("/pumps"))
    return {
      title: "Pumps and bottles",
      description: "Replace bottles, assign ingredients, clean and calibrate.",
      steps: [
        "Tap an ingredient on a bottle to change it.",
        "Use Cleaning when changing liquids and Calibration after changing pump behavior.",
      ],
    };
  if (path.endsWith("/network"))
    return {
      title: "Network",
      description: "Connect Neat to Wi-Fi or use its own access point.",
      steps: [
        "Disconnect keeps the saved password; Forget removes it.",
        "Use the Neat access point details if no other network is available.",
      ],
    };
  if (path.endsWith("/system"))
    return {
      title: "System",
      description: "View live device health, storage and network status.",
      steps: ["Restart the controller here only when troubleshooting."],
    };
  if (path.endsWith("/developer"))
    return {
      title: "Developer",
      description: "Hardware configuration and direct component tests.",
      steps: ["Use these controls only while servicing the machine."],
    };
  if (path.endsWith("/about"))
    return {
      title: "About Neat",
      description: "View the model, firmware and connection state.",
      steps: ["This information is useful for support and troubleshooting."],
    };
  return {
    title: "General settings",
    description: "Change everyday behavior for this Neat machine.",
    steps: ["Tap anywhere on a toggle row, then save your changes."],
  };
}

export function PageInfoButton() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const help = helpFor(pathname);
  return (
    <>
      <button
        className="icon-button page-info-button"
        aria-label={`About this page: ${help.title}`}
        onClick={() => setOpen(true)}
        type="button"
      >
        <Info size={20} />
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={help.title}
        description={help.description}
      >
        <ol className="page-help-steps">
          {help.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </Modal>
    </>
  );
}
