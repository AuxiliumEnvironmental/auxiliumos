import type { ButtonHTMLAttributes } from "react";

/** Presentation control; never grants permission or implements persistence. */
export function Button({ variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "text-button" }) {
  return <button {...props} className={`button ${variant} ${className}`} />;
}