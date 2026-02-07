import type { ReactNode } from "react";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface AuthShellProps {
  title: string;
  description?: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ title, description, badge, children, footer }: AuthShellProps) {
  return (
    <div className="page-shell flex items-center justify-center soft-grid">
      <Card className="glass-panel w-full max-w-md border-0 py-0">
        <CardHeader className="py-6">
          {badge}
          <CardTitle className="hero-title text-2xl">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        {children}
        {footer ? <CardFooter className="py-6">{footer}</CardFooter> : null}
      </Card>
    </div>
  );
}
