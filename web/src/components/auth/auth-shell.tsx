import type { ReactNode } from "react";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface AuthShellProps {
  title: string;
  description?: ReactNode;
  badge?: ReactNode;
  masthead?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ title, description, badge, masthead, children, footer }: AuthShellProps) {
  return (
    <div className="page-shell flex items-center justify-center soft-grid">
      <div className="w-full max-w-5xl space-y-3 px-4 py-2 md:space-y-4 md:px-0 md:py-0">
        {masthead}
      <Card className="glass-panel mx-auto w-full max-w-md border-0 py-0">
        <CardHeader className="py-6">
          {badge}
          <CardTitle className="hero-title text-2xl">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        {children}
        {footer ? <CardFooter className="py-6">{footer}</CardFooter> : null}
      </Card>
      </div>
    </div>
  );
}
