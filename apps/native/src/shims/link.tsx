import { type AnchorHTMLAttributes, forwardRef } from "react";
import { Link as RouterLink } from "react-router-dom";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean | null;
};

/** next/link for the app: app paths through the router, other URLs as plain links (the app opens them outside). */
const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, replace, scroll, prefetch, ...rest }, ref) {
  void prefetch;
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//") || href.startsWith("#")) {
    return <a ref={ref} href={href} {...rest} />;
  }
  return <RouterLink ref={ref} to={href} replace={replace} preventScrollReset={scroll === false} {...rest} />;
});

export default Link;
