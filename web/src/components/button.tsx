import type { ButtonHTMLAttributes } from "react";

/** Presentation control; never grants permission or implements persistence. */
export function Button({ variant = "secondary", className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "text-button" }) {
  return <button {...props} type={type} className={`button ${variant} ${className}`} />;
}