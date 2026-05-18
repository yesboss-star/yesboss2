import { forwardRef, LabelHTMLAttributes } from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

const Label = forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { required?: boolean }
>(({ className, required, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "text-sm font-medium text-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className
    )}
    {...props}
  >
    {props.children}
    {required && <span className="text-rose-400 ml-1">*</span>}
  </LabelPrimitive.Root>
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
