/**
 * A full reload. After a hidden thread is unhidden on its 404 page, a router refresh isn't enough:
 * the client keeps showing the caught not-found state until the pathname changes.
 */
export function reloadPage() {
  window.location.reload();
}
