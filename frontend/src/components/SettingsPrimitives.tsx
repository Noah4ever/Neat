import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { PageInfoButton } from "./PageInfoButton";

interface PageHeadingProps {
  title: string;
  subtitle: string;
  action?: ReactNode;
  onTitleClick?: () => void;
}

export function PageHeading({
  title,
  subtitle,
  action,
  onTitleClick,
}: PageHeadingProps) {
  return (
    <header className="page-heading">
      <div>
        <div className="page-title-with-info">
          <h1 onClick={onTitleClick}>{title}</h1>
          <PageInfoButton />
        </div>
        <p>{subtitle}</p>
      </div>
      {action}
    </header>
  );
}

interface SettingsRowProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  value?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
}

export function SettingsRow({
  icon: Icon,
  title,
  description,
  value,
  onClick,
  danger = false,
}: SettingsRowProps) {
  const content = (
    <>
      {Icon && <Icon className="settings-row__icon" size={20} />}
      <span className="settings-row__copy">
        <strong>{title}</strong>
        {description && <small>{description}</small>}
      </span>
      {value && <span className="settings-row__value">{value}</span>}
      {onClick && <ChevronRight size={18} />}
    </>
  );

  if (onClick) {
    return (
      <button
        className={`settings-row ${danger ? "settings-row--danger" : ""}`}
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <div className={`settings-row ${danger ? "settings-row--danger" : ""}`}>
      {content}
    </div>
  );
}

export function SettingsGroup({ children }: { children: ReactNode }) {
  return <section className="settings-group">{children}</section>;
}
