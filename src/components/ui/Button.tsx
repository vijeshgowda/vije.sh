import Link from "next/link";
import type { Route } from "next";
import type { ComponentProps } from "react";
import styles from "./Button.module.css";

type Variant = { variant?: "default" | "red"; size?: "md" | "sm" };

function cls({ variant = "default", size = "md" }: Variant, extra?: string) {
  return [styles.btn, variant === "red" && styles.red, size === "sm" && styles.sm, extra]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...rest
}: ComponentProps<"button"> & Variant) {
  return <button type={type} className={cls({ variant, size }, className)} {...rest} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  href,
  ...rest
}: Omit<ComponentProps<"a">, "href"> & Variant & { href: Route }) {
  return <Link href={href} className={cls({ variant, size }, className)} {...rest} />;
}
