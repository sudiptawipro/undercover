import { ClaimPage } from "./ClaimPage";
import { QueuePage } from "./QueuePage";
import { useRoute } from "./route";

export function App() {
  const route = useRoute();
  return (
    <>
      <header className="site-header">
        <a className="brand" href="#/">
          UnderCover <span className="tagline">Claims desk</span>
        </a>
        <nav aria-label="Main">
          <a
            href="#/"
            aria-current={route.page === "queue" ? "page" : undefined}
          >
            Queue
          </a>
        </nav>
      </header>
      <main>
        {route.page === "claim" ? (
          <ClaimPage key={route.claimId} claimId={route.claimId} />
        ) : (
          <QueuePage />
        )}
      </main>
    </>
  );
}
